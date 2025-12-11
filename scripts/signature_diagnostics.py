import numpy as np
import cv2
from verifier_lib import verify_signature
from scripts.embedder_fixed import embed_signature


def compute_image_stats(img_path):
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError(f"Cannot read {img_path}")
    h, w, _ = img.shape
    mean = np.mean(img)
    std = np.std(img)
    return {"height": h, "width": w, "mean": round(mean, 2), "std": round(std, 2)}


def run_diagnostics(input_path, key, output_prefix="diag_test"):
    alphas = [0.05, 0.1, 0.2, 0.3, 0.4]
    block_sizes = [128, 256, 512]

    print("🧪 Signature Embedding Diagnostics")
    print(f"Base Image: {input_path}")
    base_stats = compute_image_stats(input_path)
    # --- resize safeguard for huge images ---
    import cv2
    img = cv2.imread(input_path)
    if img is None:
        raise ValueError(f"Cannot read {input_path}")
    if img.shape[0] > 1500 or img.shape[1] > 1500:
        scale = 1500.0 / max(img.shape[0], img.shape[1])
        img = cv2.resize(img, (int(img.shape[1] * scale), int(img.shape[0] * scale)))
        cv2.imwrite("tmp_resized.png", img)
        input_path = "tmp_resized.png"
    # ----------------------------------------

    print(f"  • Dimensions: {base_stats['width']}x{base_stats['height']}")
    print(f"  • Mean Pixel: {base_stats['mean']} | StdDev: {base_stats['std']}")

    results = []
    for block in block_sizes:
        for alpha in alphas:
            out_path = f"{output_prefix}_a{alpha}_b{block}.png"
            try:
                embed_signature(input_path, key, out_path, alpha=alpha, block_size=block)
                res = verify_signature(out_path, key, alpha=alpha, block_size=block, threshold=0.8)
                results.append((alpha, block, res["authenticity_score"], res["status"]))
                print(f"  ✅ alpha={alpha}, block={block} → score={res['authenticity_score']} ({res['status']})")
            except Exception as e:
                print(f"  ⚠️ alpha={alpha}, block={block} failed: {e}")

    print("\n📊 Summary (best detection first):")
    results.sort(key=lambda x: x[2], reverse=True)
    for alpha, block, score, status in results:
        print(f"  α={alpha:<4} | block={block:<4} | score={score:<6} | {status}")

    if results:
        best = results[0]
        print(f"\n🏁 Best setting: alpha={best[0]}, block={best[1]}, score={best[2]}, status={best[3]}")
    else:
        print("No valid tests ran.")


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print("Usage: python3 signature_diagnostics.py <input_image> <key>")
        sys.exit(1)

    input_path, key = sys.argv[1], sys.argv[2]
    run_diagnostics(input_path, key)
