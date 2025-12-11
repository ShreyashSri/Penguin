import cv2
import numpy as np
import hashlib
import argparse
import os


def embed_signature(image_path, key, alpha=40, block_size=200, output_path=None):
    """
    Embeds a deterministic signature pattern based on the key into the center of the image.

    Args:
        image_path (str): Path to the input image.
        key (str): Key string (GPG private key, user ID, etc.).
        alpha (float): Strength of pixel modification.
        block_size (int): Size of the central block to embed signature.
        output_path (str): Path to save the signed image (default: *_signed.png).
    """

    # Load image
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Failed to load image: {image_path}")
    h, w, _ = img.shape

    # Compute key hash to get deterministic pixel values
    key_hash = hashlib.sha256(key.encode()).digest()
    np.random.seed(int.from_bytes(key_hash[:4], "big"))

    # Generate pseudo-random signature pattern
    block = np.random.rand(block_size, block_size, 3).astype(np.float32)

    # Normalize and scale
    block = (block - 0.5) * 2 * alpha

    # Find center coordinates
    cx, cy = w // 2, h // 2
    bx, by = cx - block_size // 2, cy - block_size // 2

    # Ensure region fits image
    if bx < 0 or by < 0 or bx + block_size > w or by + block_size > h:
        raise ValueError("Block size too large for image dimensions")

    # Blend signature into image (invisible embedding)
    signed = img.copy().astype(np.float32)
    signed[by:by + block_size, bx:bx + block_size, :] += block
    signed = np.clip(signed, 0, 255).astype(np.uint8)

    # Save result
    if output_path is None:
        base, ext = os.path.splitext(image_path)
        output_path = f"{base}_signed{ext}"

    cv2.imwrite(output_path, signed)
    print(f"✅ Signature embedded and saved to {output_path}")

    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Embed a digital signature pattern into an image.")
    parser.add_argument("input", help="Input image path")
    parser.add_argument("--key", required=True, help="Signature key (string or GPG private key fragment)")
    parser.add_argument("--alpha", type=float, default=40, help="Embedding strength (default: 40)")
    parser.add_argument("--block", type=int, default=200, help="Block size for embedding (default: 200)")
    parser.add_argument("--output", help="Output file path (default: *_signed.png)")
    args = parser.parse_args()

    embed_signature(args.input, args.key, alpha=args.alpha, block_size=args.block, output_path=args.output)