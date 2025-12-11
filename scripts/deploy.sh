#!/bin/bash
set -e

echo "🚀 Setting up PoAR FastAPI Model Server..."

# === CONFIG ===
APP_DIR="${HOME}/poar_model_server"
SRC_MODEL="/home/shrey/Codes/heckor/Penguin/scripts/detector_torchscript_local.pt"
DST_MODEL="${APP_DIR}/poar_model.pt"
PORT=8788
PYTHON=$(which python3)

# === Ensure python3 exists ===
if [ -z "$PYTHON" ]; then
  echo "❌ Python3 not found. Install it first."
  exit 1
fi

# === Create app directory ===
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# === Copy model ===
if [ ! -f "$SRC_MODEL" ]; then
  echo "❌ Source model not found: $SRC_MODEL"
  exit 1
fi

echo "📦 Copying model to deployment directory..."
cp "$SRC_MODEL" "$DST_MODEL"

# === Create virtual environment ===
if [ ! -d "venv" ]; then
  echo "🐍 Creating virtual environment..."
  $PYTHON -m venv venv
fi

source venv/bin/activate

# === Install dependencies ===
echo "📦 Installing dependencies..."
pip install --upgrade pip
pip install fastapi uvicorn torch torchvision Pillow python-multipart

# === Create FastAPI app ===
cat > main.py <<'EOF'
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import torch
from torchvision import transforms
from PIL import Image
import io, math

app = FastAPI(title="PoAR Online Model", version="1.1")

# === Enable CORS for frontend ===
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local development, open it up
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_PATH = "poar_model.pt"
print(f"📁 Loading model from {MODEL_PATH}")
model = torch.jit.load(MODEL_PATH, map_location="cpu")
model.eval()

# === Must match your training preprocessing ===
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.CenterCrop(200),
    transforms.ToTensor(),
    transforms.Normalize([0.5], [0.5]),
])

@app.get("/")
async def root():
    return {"status": "ok", "message": "PoAR verifier online and stable"}

@app.post("/verify")
async def verify(file: UploadFile = File(...)):
    try:
        content = await file.read()
        image = Image.open(io.BytesIO(content)).convert("RGB")
        x = transform(image).unsqueeze(0)

        with torch.no_grad():
            raw_score = float(model(x).item())
            score = 1 / (1 + math.exp(-raw_score))  # sigmoid normalization

        print(f"🧠 Raw score: {raw_score:.4f} | Normalized: {score:.4f}")

        return JSONResponse({
            "authenticity_score": score,
            "threshold": 0.8,
            "status": "AUTHENTIC" if score > 0.8 else "NOT AUTHENTIC"
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
EOF

# === Run server ===
echo "🚀 Starting server on port ${PORT}..."
pkill -f "uvicorn" || true
nohup venv/bin/uvicorn main:app --host 0.0.0.0 --port ${PORT} > server.log 2>&1 &

sleep 3
echo "✅ Server deployed successfully!"
echo "🌐 Verify at: http://localhost:${PORT}/"
echo "📄 Logs: tail -f ${APP_DIR}/server.log"
EOF
