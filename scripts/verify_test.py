import cv2
import numpy as np
import hashlib
import argparse
import sys
import os


def compute_expected_pattern(key, block_size):
    """Generate deterministic Gaussian pattern from key."""
    hash_digest = hashlib.sha256(key.encode()).hexdigest()
    seed = int(hash_digest, 16) % (2**32)
    rng = np.random.default_rng(seed)
    pattern = rng.standard_normal((block_size, block_size, 3)).astype(np.float32)
    pattern = (pattern - np.mean(pattern)) / (np.std(pattern) + 1e-6)
    return pattern


def extract_center_block(img, block_size):
    """Extract the central block of an image."""
    h, w, _ = img.shape
    cx, cy = w // 2, h // 2
    bx, by = cx - block_size // 2, cy - block_size // 2
    block = img[by:by + block_size, bx:bx + block_size, :].astype(np.float32)
    return block


def verify_image(image_path, key, alpha=0.25, block_size=256, threshold=0.8):
    """Verify if an image contains the embedded signature pattern."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not load image: {image_path}")

    # Convert to grayscale luminance channel
    img_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    img_gray = np.expand_dims(img_gray, axis=2)  # to keep 3D shape consistency

    expected_pattern = compute_expected_pattern(key, block_size)
    expected_pattern = expected_pattern[:, :, :1]  # only luminance

    block = extract_center_block(img_gray, block_size)

    # Normalize both
    block_norm = (block - np.mean(block)) / (np.std(block) + 1e-6)
    expected_norm = (expected_pattern - np.mean(expected_pattern)) / (np.std(expected_pattern) + 1e-6)

    # Compute correlation
    corr = np.sum(block_norm * expected_norm) / np.sqrt(
        np.sum(block_norm**2) * np.sum(expected_norm**2) + 1e-9
    )

    # Map correlation [-1, 1] → [0, 1]
    score = (corr + 1) / 2
    is_authentic = score > threshold

    return {
        "image": image_path,
        "authenticity_score": round(float(score), 4),
        "threshold": threshold,
        "status": "AUTHENTIC" if is_authentic else "NOT AUTHENTIC"
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify authenticity of an image with an embedded signature.")
    parser.add_argument("input", help="Path to the image to verify")
    parser.add_argument("--key", required=True, help="Signature key used during embedding")
    parser.add_argument("--alpha", type=float, default=0.25, help="Embedding strength (default: 0.25)")
    parser.add_argument("--block", type=int, default=256, help="Block size (default: 256)")
    parser.add_argument("--threshold", type=float, default=0.8, help="Detection threshold (default: 0.8)")
    args = parser.parse_args()

    try:
        result = verify_image(args.input, args.key, alpha=args.alpha, block_size=args.block, threshold=args.threshold)
        print("🔍 Verification Result:")
        for k, v in result.items():
            print(f"  {k}: {v}")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
