#!/usr/bin/env python3
import torch
import torch.nn.functional as F
from torchvision import transforms
from PIL import Image, ImageEnhance
import numpy as np, sys, os, math

# === ANSI colors ===
RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[92m"
RED = "\033[91m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
GRAY = "\033[90m"

def print_bar(score, length=40):
    filled = int(length * score)
    empty = length - filled
    color = GREEN if score > 0.8 else YELLOW if score > 0.5 else RED
    bar = f"{color}{'█'*filled}{GRAY}{'░'*empty}{RESET}"
    return f"[{bar}]"

def banner():
    os.system("clear")
    print(f"{CYAN}╔════════════════════════════════════════════╗")
    print(f"║   🧠 PoAR Image Authenticity Verifier CLI  ║")
    print(f"╚════════════════════════════════════════════╝{RESET}\n")

# === Load model ===
MODEL_PATH = "poar_model.pt"
if not os.path.exists(MODEL_PATH):
    print(f"{RED}❌ Model not found at {MODEL_PATH}{RESET}")
    sys.exit(1)

print(f"{CYAN}📁 Loading model from {MODEL_PATH}{RESET}")
model = torch.jit.load(MODEL_PATH, map_location="cpu")
model.eval()

# === Image preprocessing (RGB + center crop) ===
transform = transforms.Compose([
    transforms.CenterCrop(200),
    transforms.ToTensor(),
    transforms.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
])

def verify_image(path):
    if not os.path.exists(path):
        print(f"{RED}❌ File not found: {path}{RESET}")
        sys.exit(1)
    try:
        # open in RGB mode
        image = Image.open(path).convert("RGB")
        image = ImageEnhance.Contrast(image).enhance(1.5)

        np_img = np.array(image)
        print(f"{GRAY}📸 Image shape: {np_img.shape}, range: {np.min(np_img)}–{np.max(np_img)}{RESET}")

        x = transform(image).unsqueeze(0)
        print(f"{GRAY}🧩 Tensor shape: {x.shape}, min: {x.min():.3f}, max: {x.max():.3f}{RESET}")

        with torch.no_grad():
            out = model(x)
            if isinstance(out, (list, tuple)):
                out = out[0]
            if isinstance(out, torch.Tensor):
                raw = out.mean().item()
            else:
                raw = float(out)

        # normalize safely
        score = float(torch.sigmoid(torch.tensor(raw)).item())
        status = "AUTHENTIC" if score > 0.8 else "NOT AUTHENTIC"
        color = GREEN if score > 0.8 else RED

        print(f"\n🧠 Raw output: {raw:.4f}")
        print(f"🎯 Normalized score: {score:.4f}\n")
        print(f"{BOLD}{color}{status}{RESET}")
        print(print_bar(score))
        print(f"Threshold: {CYAN}0.80{RESET}")
        print(f"Confidence: {BOLD}{(score*100):.2f}%{RESET}\n")

    except Exception as e:
        print(f"{RED}❌ Error: {e}{RESET}")
        sys.exit(1)

def main():
    banner()
    if len(sys.argv) < 2:
        print(f"{YELLOW}Usage: python poar_cli.py <image_path>{RESET}")
        sys.exit(1)
    verify_image(sys.argv[1])

if __name__ == "__main__":
    main()
