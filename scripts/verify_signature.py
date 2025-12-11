# verify_signature.py
import argparse
import sys
from verifier_lib import verify_signature


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify authenticity of an image with an embedded signature.")
    parser.add_argument("input", help="Path to the image to verify")
    parser.add_argument("--key", required=True, help="Signature key used during embedding")
    parser.add_argument("--alpha", type=float, default=0.25)
    parser.add_argument("--block", type=int, default=256)
    parser.add_argument("--threshold", type=float, default=0.8)
    args = parser.parse_args()

    try:
        result = verify_signature(args.input, args.key, alpha=args.alpha, block_size=args.block, threshold=args.threshold)
        print("🔍 Verification Result:")
        for k, v in result.items():
            print(f"  {k}: {v}")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
