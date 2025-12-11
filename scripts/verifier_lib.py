import cv2
import numpy as np
import hashlib
import argparse
import os
import sys

# ============================================================
#  DETERMINISTIC PATTERN GENERATOR  (used for both operations)
# ============================================================

def signature_pattern(key: str, block_size: int):
    """Generate deterministic normalized Gaussian noise for both embed & verify."""
    h = int(hashlib.sha256(key.encode()).hexdigest(), 16) % (2**32)
    rng = np.random.default_rng(h)
    pat = rng.standard_normal((block_size, block_size)).astype(np.float32)
    pat = (pat - pat.mean()) / (pat.std() + 1e-6)
    return pat

# ============================================================
#  EMBEDDING FUNCTION
# ============================================================

def embed_signature(image_path, key, output_path, alpha=0.25, block_size=256):
    """Embed a verifiable signature into an image (grayscale domain)."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"Could not open {image_path}")
    img = img.astype(np.float32)
    h, w = img.shape
    block_size = min(block_size, h - 20, w - 20)

    pattern = signature_pattern(key, block_size)
    by, bx = (h - block_size) // 2, (w - block_size) // 2

    img[by:by + block_size, bx:bx + block_size] += alpha * pattern * img.std()

    out = np.clip(img, 0, 255).astype(np.uint8)
    cv2.imwrite(output_path, out)

    print(f"✅ Signature embedded successfully!\n"
          f"  Image: {output_path}\n"
          f"  Alpha: {alpha}\n"
          f"  Block size: {block_size}")

# ============================================================
#  VERIFICATION FUNCTION
# ============================================================

def verify_signature(image_path, key, alpha=0.25, block_size=256, threshold=0.8):
    """Verify authenticity of an image previously signed with a key."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"Could not load image: {image_path}")
    img = img.astype(np.float32)
    h, w = img.shape
    block_size = min(block_size, h - 20, w - 20)

    pattern = signature_pattern(key, block_size)
    by, bx = (h - block_size) // 2, (w - block_size) // 2
    block = img[by:by + block_size, bx:bx + block_size]

    block_n = (block - block.mean()) / (block.std() + 1e-6)
    pat_n = (pattern - pattern.mean()) / (pattern.std() + 1e-6)

    corr = np.sum(block_n * pat_n) / np.sqrt(np.sum(block_n**2) * np.sum(pat_n**2) + 1e-9)
    score = (corr + 1) / 2
    status = "AUTHENTIC" if score > threshold else "NOT AUTHENTIC"

    print("🔍 Verification Result:")
    print(f"  image: {image_path}")
    print(f"  authenticity_score: {round(float(score), 4)}")
    print(f"  threshold: {threshold}")
    print(f"  status: {status}")

    return score, status

# ============================================================
#  CLI ENTRY POINT
# ============================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Embed or verify a signature inside an image.")
    sub = parser.add_subparsers(dest="command", required=True)

    # Embed command
    embed_cmd = sub.add_parser("embed", help="Embed a signature into an image.")
    embed_cmd.add_argument("input", help="Input image path")
    embed_cmd.add_argument("key", help="Signature key")
    embed_cmd.add_argument("output", help="Output signed image path")
    embed_cmd.add_argument("--alpha", type=float, default=0.25, help="Embedding strength")
    embed_cmd.add_argument("--block", type=int, default=256, help="Block size")

    # Verify command
    verify_cmd = sub.add_parser("verify", help="Verify a signed image.")
    verify_cmd.add_argument("input", help="Signed image path")
    verify_cmd.add_argument("key", help="Signature key")
    verify_cmd.add_argument("--alpha", type=float, default=0.25, help="Embedding strength used during signing")
    verify_cmd.add_argument("--block", type=int, default=256, help="Block size used during signing")
    verify_cmd.add_argument("--threshold", type=float, default=0.8, help="Authenticity threshold")

    args = parser.parse_args()

    try:
        if args.command == "embed":
            embed_signature(args.input, args.key, args.output, alpha=args.alpha, block_size=args.block)
        elif args.command == "verify":
            verify_signature(args.input, args.key, alpha=args.alpha, block_size=args.block, threshold=args.threshold)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
