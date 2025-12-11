#!/usr/bin/env python3
"""
PoAR Embed + Verify Tool
- Embeds cryptographic pixel signatures derived from a GPG key
- Runs model verification using TorchScript detector
"""

import os, io, json, random, argparse
import numpy as np
from hashlib import sha256
from PIL import Image
import torch
from torchvision import transforms


# ===========================
#  🔐 SIGNATURE EMBED LOGIC
# ===========================
def key_to_seed(gpg_key: str) -> int:
    """Convert GPG key string into deterministic random seed."""
    return int(sha256(gpg_key.encode()).hexdigest(), 16) % (2**32)

def embed_signature(img: Image.Image, gpg_key: str, alpha: float = 0.05,
                    block_min: int = 200, block_max: int = 300):
    """
    Embed unique key-based pixel pattern in image center.
    """
    seed = key_to_seed(gpg_key)
    np.random.seed(seed)

    arr = np.array(img).astype(np.float32)
    h, w, _ = arr.shape
    block = random.randint(block_min, block_max)
    bx, by = (w - block) // 2, (h - block) // 2

    pattern = np.random.randn(block, block, 3)
    arr[by:by+block, bx:bx+block, :] += alpha * pattern * 255
    arr = np.clip(arr, 0, 255).astype(np.uint8)

    meta = {"seed": seed, "block_size": block, "center": (bx, by)}
    return arr, meta

def verify_signature(img: Image.Image, gpg_key: str, block: int = 250):
    """Extract the embedded region for authenticity detection."""
    seed = key_to_seed(gpg_key)
    np.random.seed(seed)
    arr = np.array(img).astype(np.float32)
    h, w, _ = arr.shape
    bx, by = (w - block) // 2, (h - block) // 2
    region = arr[by:by+block, bx:bx+block, :]
    return np.clip(region / 255.0, 0, 1)


# ===========================
#  🧠 MODEL VERIFICATION CORE
# ===========================
class PoARDetector:
    def __init__(self, model_path="detector_torchscript_local.pt", threshold=0.6):
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"❌ Model not found at {model_path}")
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"📁 Loading model from {model_path} on {self.device}")
        self.model = torch.jit.load(model_path, map_location=self.device)
        self.model.eval()
        self.threshold = threshold
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
        ])

    def predict(self, img: Image.Image):
        """Run authenticity inference on given image."""
        tensor = self.transform(img).unsqueeze(0).to(self.device)
        with torch.no_grad():
            output = self.model(tensor)
            if isinstance(output, (list, tuple)):
                output = output[0]
            raw = output.mean().item()
            score = float(torch.sigmoid(torch.tensor(raw)).item())
        return {"raw": raw, "score": score,
                "status": "AUTHENTIC" if score >= self.threshold else "NOT AUTHENTIC"}


# ===========================
#  🧩 CLI ENTRY
# ===========================
def main():
    parser = argparse.ArgumentParser(description="PoAR Embed + Verify Utility")
    sub = parser.add_subparsers(dest="mode", required=True)

    # Embed
    p_embed = sub.add_parser("embed", help="Embed signature into image")
    p_embed.add_argument("input", help="Path to input image")
    p_embed.add_argument("--key", default="user_key_60", help="GPG private key")
    p_embed.add_argument("--alpha", type=float, default=0.05, help="Embedding strength")
    p_embed.add_argument("--output", default="signed_output.png", help="Output path")

    # Verify
    # Verify
    p_verify = sub.add_parser("verify", help="Verify authenticity using PoAR model")
    p_verify.add_argument("input", help="Image to verify")
    p_verify.add_argument("--key", default="user_key_60", help="GPG key")
    p_verify.add_argument(
        "--model",
        default=os.path.join(os.path.dirname(__file__), "detector_torchscript_local.pt"),
        help="TorchScript model path"
    )


    args = parser.parse_args()

    if args.mode == "embed":
        img = Image.open(args.input).convert("RGB")
        signed, meta = embed_signature(img, args.key, alpha=args.alpha)
        Image.fromarray(signed).save(args.output)
        print(f"✅ Embedded signature → {args.output}")
        print(json.dumps(meta, indent=2))

    elif args.mode == "verify":
        img = Image.open(args.input).convert("RGB")
        patch = verify_signature(img, args.key)
        patch_img = Image.fromarray((patch * 255).astype(np.uint8))
        detector = PoARDetector(model_path=args.model)
        result = detector.predict(patch_img)
        print("\n🔍 Verification Result:")
        print(json.dumps(result, indent=2))
        print("✅ Status:", result["status"])


if __name__ == "__main__":
    main()
