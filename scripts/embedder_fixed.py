#!/usr/bin/env python3
"""
Proof-of-Art aligned embedder (training-consistent)
---------------------------------------------------
- Embeds key pattern into the Y channel of a 200x200 center block
- Uses 8x8 DCT grids with JPEG-style quantization
- Saves as JPEG (quality 85)
"""

import cv2
import numpy as np
import hashlib
import argparse
import os


def derive_pattern(key: str, size: int = 200) -> np.ndarray:
    """Generate ±1 binary pattern deterministic from key."""
    key_hash = hashlib.sha256(key.encode()).digest()
    np.random.seed(int.from_bytes(key_hash[:4], "big"))
    pattern = np.random.rand(size, size)
    return np.where(pattern > 0.5, 1, -1).astype(np.float32)


def extract_center(img, size):
    h, w = img.shape[:2]
    cy, cx = h // 2, w // 2
    return img[cy-size//2:cy+size//2, cx-size//2:cx+size//2]


def replace_center(img, patch):
    h, w = img.shape[:2]
    cy, cx = h // 2, w // 2
    result = img.copy()
    result[cy-patch.shape[0]//2:cy+patch.shape[0]//2,
           cx-patch.shape[1]//2:cx+patch.shape[1]//2] = patch
    return result


def blockwise_dct_embed(y_block, pattern_block, alpha):
    """Perform 8x8 blockwise DCT embedding."""
    h, w = y_block.shape
    y_emb = np.zeros_like(y_block)
    for i in range(0, h, 8):
        for j in range(0, w, 8):
            sub_y = y_block[i:i+8, j:j+8].astype(np.float32)
            sub_p = pattern_block[i:i+8, j:j+8]
            dct = cv2.dct(sub_y)
            dct[1:6, 1:6] += alpha * sub_p[1:6, 1:6]  # mid-band embed
            y_emb[i:i+8, j:j+8] = cv2.idct(dct)
    return np.clip(y_emb, 0, 255)


def embed(input_path, key, output_path, alpha=10, size=200):
    img = cv2.imread(input_path)
    if img is None:
        raise ValueError("Image not found")

    ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
    y, cr, cb = cv2.split(ycrcb)
    region = extract_center(y, size)
    pattern = derive_pattern(key, size)

    region_emb = blockwise_dct_embed(region, pattern, alpha)
    y_mod = replace_center(y, region_emb)

    merged = cv2.merge([y_mod, cr, cb])
    img_out = cv2.cvtColor(merged, cv2.COLOR_YCrCb2BGR)
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    cv2.imwrite(output_path, img_out, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(f"✅ Embedded PoAR-style signature into {output_path}")


def verify(image_path, key, size=200, threshold=0.8):
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError("Image not found")

    ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
    y, _, _ = cv2.split(ycrcb)
    region = extract_center(y, size)
    pattern = derive_pattern(key, size)

    corrs = []
    for i in range(0, size, 8):
        for j in range(0, size, 8):
            sub_y = region[i:i+8, j:j+8].astype(np.float32)
            sub_p = pattern[i:i+8, j:j+8]
            dct = cv2.dct(sub_y)
            corr = np.mean(np.sign(dct[1:6, 1:6]) * sub_p[1:6, 1:6])
            corrs.append(corr)

    score = (np.mean(corrs) + 1) / 2
    status = "AUTHENTIC" if score > threshold else "NOT AUTHENTIC"

    print("\n🔍 Verification Result:")
    print(f"  image: {image_path}")
    print(f"  authenticity_score: {score:.4f}")
    print(f"  threshold: {threshold}")
    print(f"  status: {status}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("embed")
    p1.add_argument("input")
    p1.add_argument("--key", required=True)
    p1.add_argument("--output", default="signed.jpg")
    p1.add_argument("--alpha", type=float, default=10)
    p1.add_argument("--size", type=int, default=200)

    p2 = sub.add_parser("verify")
    p2.add_argument("input")
    p2.add_argument("--key", required=True)
    p2.add_argument("--size", type=int, default=200)
    p2.add_argument("--threshold", type=float, default=0.8)

    args = parser.parse_args()

    if args.cmd == "embed":
        embed(args.input, args.key, args.output, args.alpha, args.size)
    elif args.cmd == "verify":
        verify(args.input, args.key, args.size, args.threshold)
