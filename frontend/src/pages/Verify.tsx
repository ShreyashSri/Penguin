import { useState, useRef } from "react";
import { Upload, X, CheckCircle2, XCircle, Shield } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import Topbar from "../components/Topbar";

const GPG_KEY = "user_key_60";
const API_URL = "http://localhost:8788/verify";  // not 0.0.0.0


export default function Verify() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Only image files are supported.");
      return;
    }
    setSelectedFile(file);
    setResult(null);

    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleVerify = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("gpg_key", GPG_KEY); // Include GPG key

      const response = await fetch(API_URL, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server responded ${response.status}`);
      }

      const data = await response.json();

      setResult({
        authenticity_score: data.authenticity_score,
        threshold: data.threshold,
        status: data.status,
      });
    } catch (error: any) {
      console.error("Verification failed:", error);
      setResult({
        error: error.message || "Verification failed.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-gray-100">
      <Topbar />
      <div className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-center bg-gradient-to-r from-fuchsia-500 to-cyan-500 bg-clip-text text-transparent mb-10">
          Verify Artwork Authenticity
        </h1>

        {!selectedFile ? (
          <Card>
            <CardContent className="p-10">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer ${
                  isDragging
                    ? "border-cyan-500 bg-cyan-500/10"
                    : "border-neutral-700 hover:border-neutral-600"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-lg text-gray-300 mb-2">
                  Drop an image here or click to upload
                </p>
                <p className="text-sm text-gray-500">
                  Only images with embedded PoAR signatures can be verified.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left side: image preview */}
            <div>
              <Card>
                <CardContent className="p-6">
                  {preview && (
                    <div className="relative border border-neutral-800 rounded-xl overflow-hidden">
                      <img
                        src={preview}
                        alt="Preview"
                        className="w-full h-auto max-h-[500px] object-contain bg-neutral-900"
                      />
                      <button
                        onClick={handleRemoveFile}
                        className="absolute top-2 right-2 bg-black/60 hover:bg-black/90 text-white p-2 rounded-full transition"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="mt-4">
                    <Button
                      onClick={handleVerify}
                      disabled={isUploading}
                      className="w-full bg-cyan-600 hover:bg-cyan-700"
                    >
                      {isUploading ? "Verifying..." : "Verify File"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right side: results */}
            <div>
              <Card className="sticky top-8">
                <CardContent className="p-6 space-y-4">
                  <h2 className="text-xl font-semibold text-gray-200">
                    Verification Result
                  </h2>

                  {!result ? (
                    <div className="text-center text-gray-500 py-16">
                      Upload an image and click verify.
                    </div>
                  ) : result.error ? (
                    <div className="flex items-start gap-3 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                      <XCircle className="mt-0.5" size={20} />
                      <div>
                        <p className="font-medium mb-1">Verification Failed</p>
                        <p className="text-sm">{result.error}</p>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`rounded-lg border p-4 ${
                        result.status === "AUTHENTIC"
                          ? "bg-green-500/10 border-green-500/20 text-green-400"
                          : "bg-red-500/10 border-red-500/20 text-red-400"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        {result.status === "AUTHENTIC" ? (
                          <CheckCircle2 size={22} />
                        ) : (
                          <XCircle size={22} />
                        )}
                        <h3 className="text-lg font-semibold">
                          {result.status}
                        </h3>
                      </div>
                      <div className="text-sm text-gray-300 space-y-1">
                        <div className="flex justify-between">
                          <span>Authenticity Score:</span>
                          <span className="font-mono">
                            {result.authenticity_score.toFixed(4)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Threshold:</span>
                          <span className="font-mono">
                            {result.threshold.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Score</span>
                          <span>{(result.authenticity_score * 100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-neutral-800 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              result.status === "AUTHENTIC"
                                ? "bg-green-500"
                                : "bg-red-500"
                            }`}
                            style={{
                              width: `${Math.min(
                                (result.authenticity_score / result.threshold) *
                                  100,
                                100
                              )}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Info */}
                  <div className="mt-6 text-sm text-gray-400 border-t border-neutral-800 pt-4">
                    <div className="flex items-center gap-2">
                      <Shield size={16} className="text-cyan-400" />
                      <span>
                        All verifications are tied to custom creator
                        <code className="text-cyan-400">ShreyashSri</code>
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
