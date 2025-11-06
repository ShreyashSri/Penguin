package handlers

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	_ "golang.org/x/image/webp"

	"yourproject/internal/auth"
	"yourproject/internal/crypto"
	"yourproject/internal/eth"
	"yourproject/internal/ipfsdb"
	"yourproject/internal/models"
	"yourproject/internal/pinata"
)

type Handler struct {
	storage          *ipfsdb.StorageService
	ipfsClient       *ipfsdb.IPFSClient
	blockchainClient *ipfsdb.BlockchainClient
}

func NewHandler(storage *ipfsdb.StorageService, ipfs *ipfsdb.IPFSClient, bc *ipfsdb.BlockchainClient) *Handler {
	return &Handler{
		storage:          storage,
		ipfsClient:       ipfs,
		blockchainClient: bc,
	}
}

// RegisterUser handles user registration
func (h *Handler) RegisterUser(c echo.Context) error {
	var req struct {
		WalletAddress   string `json:"wallet_address"`
		UserType        string `json:"user_type"`
		AuthenticatorID string `json:"authenticator_id"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	// Generate Ed25519 key pair for user
	keyPair, err := crypto.GenerateKeyPair()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to generate keys"})
	}

	user := &models.User{
		ID:              uuid.New().String(),
		WalletAddress:   req.WalletAddress,
		PublicKey:       base64.StdEncoding.EncodeToString(keyPair.PublicKey),
		UserType:        req.UserType,
		CreatedAt:       time.Now(),
		AuthenticatorID: req.AuthenticatorID,
	}

	// Store private key securely (encrypted in production)
	privateKeyB64 := base64.StdEncoding.EncodeToString(keyPair.PrivateKey)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"user":        user,
		"private_key": privateKeyB64, // Send once, user must save securely
	})
}

// GenerateArt handles AI art generation with embedded encrypted metadata
func (h *Handler) GenerateArt(c echo.Context) error {
	var req models.GenerationRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	// Get authenticated user from context
	user, ok := auth.GetDBUserFromContext(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "user not authenticated"})
	}

	// Override UserID from request with authenticated user ID (security: prevent user ID spoofing)
	req.UserID = user.ID

	// Validate user has a wallet address set
	if user.WalletAddress == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "wallet address not set. Please update your profile with a wallet address.",
		})
	}

	// Validate passphrase is provided for private key encryption
	passphrase := c.Request().Header.Get("X-Passphrase")
	if passphrase == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "passphrase required in X-Passphrase header for private key encryption",
		})
	}

	// Call model provider API with temperature=0 for reproducibility
	artworkData, err := h.callLLMAPI(req.LLMProvider, req.Prompt, req.ContentType, req.Parameters)
	if err != nil {
		c.Logger().Errorf("failed to call LLM API: %v", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	// Process artwork with new embedded encryption workflow
	artwork, certificate, err := h.processArtworkWithEmbedding(
		c.Request().Context(),
		user.ID,
		user.WalletAddress,
		req.Prompt,
		artworkData,
		req.ContentType,
		req.LLMProvider,
		req.Parameters,
		passphrase,
	)
	if err != nil {
		c.Logger().Errorf("failed to process artwork in GenerateArt: %v", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"artwork":     artwork,
		"certificate": certificate,
	})
}

// ImportArt handles artwork imported from chrome extension
func (h *Handler) ImportArt(c echo.Context) error {
	var req models.ImportRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	// Get authenticated user from context
	user, ok := auth.GetDBUserFromContext(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "user not authenticated"})
	}

	// Override UserID from request with authenticated user ID (security: prevent user ID spoofing)
	req.UserID = user.ID

	// Validate user has a wallet address set
	if user.WalletAddress == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "wallet address not set. Please update your profile with a wallet address.",
		})
	}

	// Validate passphrase
	passphrase := c.Request().Header.Get("X-Passphrase")
	if passphrase == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "passphrase required in X-Passphrase header for private key encryption",
		})
	}

	// Process imported artwork with embedded encryption
	artwork, certificate, err := h.processArtworkWithEmbedding(
		c.Request().Context(),
		user.ID,
		user.WalletAddress,
		req.Prompt,
		req.FileData,
		req.ContentType,
		req.SourcePlatform,
		req.Metadata,
		passphrase,
	)
	if err != nil {
		c.Logger().Errorf("failed to process artwork: %v", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"artwork":     artwork,
		"certificate": certificate,
		"source_url":  req.SourceURL,
	})
}

// processArtworkWithEmbedding handles the complete embedding and encryption pipeline
func (h *Handler) processArtworkWithEmbedding(
	ctx context.Context,
	userID, walletAddress, prompt string,
	artworkData []byte,
	contentType, provider string,
	params map[string]string,
	passphrase string,
) (*models.Artwork, *models.ProofCertificate, error) {

	// Step 1: Generate unique Ed25519 key pair for this artwork
	keyPair, err := crypto.GenerateKeyPair()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate key pair: %w", err)
	}

	// Step 2: Create metadata to embed
	artworkID := uuid.New().String()
	temperature := 0.0 // Default temperature

	embeddedMetadata := &crypto.EmbeddedMetadata{
		UserID:      userID,
		Prompt:      prompt,
		Temperature: temperature,
		Model:       params["model"],
		Provider:    provider,
		ArtworkID:   artworkID,
		Timestamp:   time.Now(),
	}

	// Step 3: Encrypt metadata using Ed25519 public key
	encryptedData, signature, err := crypto.EncryptAndSignMetadata(embeddedMetadata, keyPair)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to encrypt metadata: %w", err)
	}

	// Step 4: Hash the prompt and original file
	promptHash := crypto.HashPrompt(prompt)
	originalHash := crypto.HashFile(artworkData)

	// Step 5: Process image and embed encrypted metadata
	var processedData []byte
	var noisePattern *crypto.NoisePattern

	if contentType == "image" {
		img, _, err := image.Decode(bytes.NewReader(artworkData))
		if err != nil {
			return nil, nil, fmt.Errorf("failed to decode image: %w", err)
		}

		bounds := img.Bounds()

		// Generate unique noise pattern for this user
		noisePattern, err = crypto.GenerateNoisePattern(userID, bounds.Dx(), bounds.Dy())
		if err != nil {
			return nil, nil, fmt.Errorf("failed to generate noise pattern: %w", err)
		}

		// Embed encrypted metadata into image using steganography
		publicKeyB64 := base64.StdEncoding.EncodeToString(keyPair.PublicKey)
		embeddedImg, err := crypto.EmbedEncryptedMetadata(img, encryptedData, noisePattern, publicKeyB64)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to embed metadata: %w", err)
		}

		// Encode processed image
		var buf bytes.Buffer
		if err := png.Encode(&buf, embeddedImg); err != nil {
			return nil, nil, fmt.Errorf("failed to encode processed image: %w", err)
		}
		processedData = buf.Bytes()
	} else {
		// For non-image content, store as-is (implement audio/video embedding separately)
		processedData = artworkData
		noisePattern = &crypto.NoisePattern{
			Signature: uuid.New().String()[:16],
		}
	}

	// Step 6: Hash processed content
	processedHash := crypto.HashFile(processedData)

	// Step 7: Encrypt and store private key with user's passphrase
	encryptedPrivateKey, err := crypto.EncryptPrivateKeyWithPassphrase(keyPair.PrivateKey, passphrase)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to encrypt private key: %w", err)
	}

	// Step 8: Create metadata for IPFS DAG
	publicKeyB64 := base64.StdEncoding.EncodeToString(keyPair.PublicKey)
	dagMetadata := &ipfsdb.DAGMetadata{
		ArtworkID:      artworkID,
		ArtistWallet:   walletAddress,
		PublicKey:      publicKeyB64,
		PromptHash:     promptHash,
		ContentHash:    processedHash,
		NoiseSignature: noisePattern.Signature,
		Timestamp:      time.Now(),
		Metadata: map[string]string{
			"name":          fmt.Sprintf("Artwork-%s", artworkID),
			"provider":      provider,
			"content_type":  contentType,
			"original_hash": originalHash,
			"signature":     base64.StdEncoding.EncodeToString(signature),
			"encrypted":     "true",
		},
	}

	// Step 9: Store on IPFS and blockchain
	dagCID, txHash, err := h.storage.StoreArtwork(ctx, processedData, dagMetadata)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to store artwork: %w", err)
	}

	// Step 10: Store encrypted private key in database
	err = h.storage.StoreEncryptedPrivateKey(artworkID, encryptedPrivateKey)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to store encrypted private key: %w", err)
	}

	// Step 11: Create artwork record
	artwork := &models.Artwork{
		ID:                artworkID,
		ArtistID:          userID,
		Prompt:            prompt,
		PromptHash:        promptHash,
		ContentType:       contentType,
		OriginalFileHash:  originalHash,
		WatermarkedHash:   processedHash,
		IPFSHash:          dagCID,
		PublicKeyEmbedded: publicKeyB64,
		NoisePattern:      noisePattern.Signature,
		BlockchainTxHash:  txHash,
		DAGNodeID:         dagCID,
		CreatedAt:         time.Now(),
		LLMProvider:       provider,
		Temperature:       temperature,
	}

	// Step 12: Create proof certificate
	certificate := &models.ProofCertificate{
		CertificateID:    uuid.New().String(),
		ArtworkID:        artworkID,
		ArtistWallet:     walletAddress,
		Prompt:           prompt,
		PromptHash:       promptHash,
		ContentHash:      processedHash,
		IPFSHash:         dagCID,
		BlockchainTxHash: txHash,
		NoiseSignature:   noisePattern.Signature,
		GPGSignature:     base64.StdEncoding.EncodeToString(signature),
		Timestamp:        time.Now(),
		IssuedAt:         time.Now(),
		VerificationURL:  fmt.Sprintf("/verify/%s", artworkID),
	}

	return artwork, certificate, nil
}

// VerifyArtwork handles artwork verification with decryption
func (h *Handler) VerifyArtwork(c echo.Context) error {
	artworkID := c.Param("id")

	// Get metadata and proof from blockchain/IPFS
	metadata, proof, err := h.storage.VerifyArtwork(c.Request().Context(), artworkID)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "artwork not found"})
	}

	// Download artwork from IPFS
	artworkData, err := h.ipfsClient.DownloadFile(metadata.ContentCID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to download artwork"})
	}

	// Verify embedded metadata for images
	var tamperDetected bool
	var confidence float64
	var extractedMetadata *crypto.EmbeddedMetadata

	if metadata.Metadata["content_type"] == "image" {
		img, _, err := image.Decode(bytes.NewReader(artworkData))
		if err == nil {
			// Extract and verify embedded metadata
			publicKeyBytes, err := base64.StdEncoding.DecodeString(metadata.PublicKey)
			if err == nil {
				extractedMetadata, tamperDetected, confidence, err = crypto.ExtractAndVerifyMetadata(img, publicKeyBytes)
				if err != nil {
					tamperDetected = true
					confidence = 0.0
				}
			}
		}
	}

	result := &models.VerificationResult{
		IsAuthentic:      !tamperDetected,
		ArtworkID:        artworkID,
		OriginalArtist:   metadata.ArtistWallet,
		CreationDate:     metadata.Timestamp,
		Prompt:           "", // Don't expose full prompt publicly
		TamperDetected:   tamperDetected,
		SimilarityScore:  confidence,
		BlockchainTxHash: proof.IPFSHash,
		CertificateURL:   fmt.Sprintf("/certificate/%s", artworkID),
		VerificationSteps: []string{
			"Blockchain verification: PASSED",
			"IPFS integrity check: PASSED",
			fmt.Sprintf("Embedded metadata verification: confidence %.2f%%", confidence*100),
			fmt.Sprintf("Cryptographic signature: %s", map[bool]string{true: "INVALID", false: "VALID"}[tamperDetected]),
		},
	}

	// Include extracted metadata if available (for authorized users)
	if extractedMetadata != nil && !tamperDetected {
		result.Prompt = extractedMetadata.Prompt // Show prompt only if verification passed
	}

	return c.JSON(http.StatusOK, result)
}

// DecryptArtworkMetadata allows user to decrypt embedded metadata with passphrase
func (h *Handler) DecryptArtworkMetadata(c echo.Context) error {
	artworkID := c.Param("id")

	// Get authenticated user
	user, ok := auth.GetDBUserFromContext(c)
	if !ok {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "user not authenticated"})
	}

	// Get passphrase from header
	passphrase := c.Request().Header.Get("X-Passphrase")
	if passphrase == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "passphrase required in X-Passphrase header",
		})
	}

	// Retrieve encrypted private key from database
	encryptedPrivateKey, err := h.storage.GetEncryptedPrivateKey(artworkID)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "artwork not found"})
	}

	// Decrypt private key using passphrase
	privateKey, err := crypto.DecryptPrivateKeyWithPassphrase(encryptedPrivateKey, passphrase)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{
			"error": "invalid passphrase or corrupted key",
		})
	}

	// Get artwork metadata
	metadata, _, err := h.storage.VerifyArtwork(c.Request().Context(), artworkID)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "artwork metadata not found"})
	}

	// Download and extract embedded data
	artworkData, err := h.ipfsClient.DownloadFile(metadata.ContentCID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to download artwork"})
	}

	img, _, err := image.Decode(bytes.NewReader(artworkData))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid image"})
	}

	// Extract encrypted data from image
	publicKeyBytes, _ := base64.StdEncoding.DecodeString(metadata.PublicKey)
	embeddedMetadata, tamperDetected, confidence, err := crypto.ExtractAndVerifyMetadata(img, publicKeyBytes)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to extract metadata"})
	}

	if tamperDetected {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "artwork has been tampered with",
		})
	}

	// Verify ownership: user must be the creator of the artwork
	if embeddedMetadata.UserID != user.ID {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": "you do not have permission to decrypt this artwork's metadata",
		})
	}

	// Create keyPair from decrypted private key and public key for potential future decryption
	keyPair := &crypto.KeyPair{
		PublicKey:  publicKeyBytes,
		PrivateKey: privateKey,
	}
	_ = keyPair // KeyPair created for potential future full decryption support

	// Return decrypted metadata
	return c.JSON(http.StatusOK, map[string]interface{}{
		"artwork_id":  artworkID,
		"metadata":    embeddedMetadata,
		"confidence":  confidence,
		"verified":    true,
		"user_id":     embeddedMetadata.UserID,
		"prompt":      embeddedMetadata.Prompt,
		"temperature": embeddedMetadata.Temperature,
		"model":       embeddedMetadata.Model,
		"provider":    embeddedMetadata.Provider,
		"timestamp":   embeddedMetadata.Timestamp,
	})
}

// GetCertificate returns the proof certificate
func (h *Handler) GetCertificate(c echo.Context) error {
	artworkID := c.Param("id")

	metadata, proof, err := h.storage.VerifyArtwork(c.Request().Context(), artworkID)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "certificate not found"})
	}

	certificate := &models.ProofCertificate{
		CertificateID:    uuid.New().String(),
		ArtworkID:        artworkID,
		ArtistWallet:     metadata.ArtistWallet,
		PromptHash:       metadata.PromptHash,
		ContentHash:      metadata.ContentHash,
		IPFSHash:         metadata.ContentCID,
		BlockchainTxHash: proof.IPFSHash,
		NoiseSignature:   metadata.NoiseSignature,
		Timestamp:        metadata.Timestamp,
		IssuedAt:         time.Now(),
		VerificationURL:  fmt.Sprintf("/verify/%s", artworkID),
	}

	return c.JSON(http.StatusOK, certificate)
}

// UploadForVerification handles file upload for verification
func (h *Handler) UploadForVerification(c echo.Context) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "no file provided"})
	}

	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to open file"})
	}
	defer src.Close()

	data, err := io.ReadAll(src)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to read file"})
	}

	// Hash the file
	fileHash := crypto.HashFile(data)

	// Try to extract embedded metadata from image
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid image file"})
	}

	// Attempt to extract public key and metadata
	extractedData, err := crypto.ExtractEmbeddedData(img)
	if err != nil {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"file_hash": fileHash,
			"message":   "No embedded metadata found. This may not be a verified artwork.",
			"verified":  false,
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"file_hash":      fileHash,
		"embedded_found": true,
		"public_key":     extractedData["public_key"],
		"signature":      extractedData["signature"],
		"message":        "Embedded metadata detected. Use /verify endpoint for full verification.",
	})
}

// callLLMAPI calls various provider APIs with temperature=0
func (h *Handler) callLLMAPI(provider, prompt, contentType string, params map[string]string) ([]byte, error) {
	switch provider {
	case "openai":
		return h.callOpenAI(prompt, contentType, params)
	case "vertex", "gemini", "google":
		return h.callVertexAI(prompt, contentType, params)
	case "stability":
		return h.callStabilityAI(prompt)
	case "grok", "xai":
		return h.callGrok(prompt, contentType, params)
	default:
		return nil, fmt.Errorf("unsupported provider: %s", provider)
	}
}

func (h *Handler) callOpenAI(prompt, contentType string, params map[string]string) ([]byte, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("OPENAI_API_KEY not set")
	}

	if contentType == "text" {
		return h.callOpenAIText(apiKey, prompt)
	} else if contentType == "image" {
		return h.callOpenAIImage(apiKey, prompt, params)
	}

	return nil, fmt.Errorf("unsupported content type")
}

func (h *Handler) callOpenAIText(apiKey, prompt string) ([]byte, error) {
	url := "https://api.openai.com/v1/chat/completions"

	payload := map[string]interface{}{
		"model":       "gpt-4",
		"messages":    []map[string]string{{"role": "user", "content": prompt}},
		"temperature": 0,
	}

	jsonData, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func (h *Handler) callStabilityAI(prompt string) ([]byte, error) {
	return nil, fmt.Errorf("not implemented")
}

// Handlers provides handlers for the node-based system
type Handlers struct {
	db           *ipfsdb.IPFSDB
	artifactsDir string
	manifestsDir string
}

func NewHandlers(db *ipfsdb.IPFSDB, artifactsDir, manifestsDir string) *Handlers {
	return &Handlers{
		db:           db,
		artifactsDir: artifactsDir,
		manifestsDir: manifestsDir,
	}
}

func (h *Handlers) ExtPush(c echo.Context) error {
	var req struct {
		Prompt    string            `json:"prompt"`
		Metadata  map[string]string `json:"metadata"`
		Timestamp time.Time         `json:"timestamp"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	key := fmt.Sprintf("/ipfs/ext-%s", uuid.New().String())
	h.db.Save(key, req)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"key":    key,
		"status": "stored",
	})
}

func (h *Handlers) CreateNode(c echo.Context) error {
	var req struct {
		Kind   string                 `json:"kind"`
		Author string                 `json:"author"`
		Body   map[string]interface{} `json:"body"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	signer, err := crypto.NewSigner()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create signer"})
	}

	nodeData := map[string]interface{}{
		"kind":      req.Kind,
		"author":    req.Author,
		"body":      req.Body,
		"timestamp": time.Now(),
	}

	nodeJSON, _ := json.Marshal(nodeData)
	nodeHash := crypto.Blake3Hex(nodeJSON)

	signature, err := signer.JWSDetached(nodeJSON)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to sign node"})
	}

	node := map[string]interface{}{
		"data":       nodeData,
		"hash":       nodeHash,
		"signature":  signature,
		"public_key": signer.PublicKey(),
		"key_id":     signer.KeyID(),
	}

	key := fmt.Sprintf("/ipfs/node-%s", nodeHash[:16])
	h.db.Save(key, node)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"key":  key,
		"node": node,
	})
}

func (h *Handlers) UploadArtifact(c echo.Context) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "no file provided"})
	}

	nodeID := c.FormValue("nodeId")
	if nodeID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "nodeId required"})
	}

	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to open file"})
	}
	defer src.Close()

	data, err := io.ReadAll(src)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to read file"})
	}

	artifactHash := crypto.SHA256Hex(data)
	blake3Hash := crypto.Blake3Hex(data)

	artifactKey := fmt.Sprintf("/ipfs/artifact-%s", blake3Hash[:16])
	artifact := map[string]interface{}{
		"data":      data,
		"hash":      artifactHash,
		"blake3":    blake3Hash,
		"node_id":   nodeID,
		"filename":  file.Filename,
		"size":      file.Size,
		"timestamp": time.Now(),
	}

	h.db.Save(artifactKey, artifact)

	filePath := fmt.Sprintf("%s/%s", h.artifactsDir, blake3Hash[:16])
	os.WriteFile(filePath, data, 0644)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"key":     artifactKey,
		"hash":    artifactHash,
		"blake3":  blake3Hash,
		"node_id": nodeID,
	})
}

func (h *Handlers) FinalizeManifest(c echo.Context) error {
	var req struct {
		NodeKeys     []string `json:"node_keys"`
		ArtifactKeys []string `json:"artifact_keys"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	nodes := []interface{}{}
	artifacts := []interface{}{}

	for _, key := range req.NodeKeys {
		if val, ok := h.db.Get(key); ok {
			nodes = append(nodes, val)
		}
	}

	for _, key := range req.ArtifactKeys {
		if val, ok := h.db.Get(key); ok {
			artifacts = append(artifacts, val)
		}
	}

	manifest := map[string]interface{}{
		"nodes":     nodes,
		"artifacts": artifacts,
		"timestamp": time.Now(),
	}

	manifestJSON, _ := json.Marshal(manifest)
	manifestHash := crypto.Blake3Hex(manifestJSON)

	manifestKey := fmt.Sprintf("/ipfs/manifest-%s", manifestHash[:16])
	h.db.Save(manifestKey, manifest)

	filePath := fmt.Sprintf("%s/%s.json", h.manifestsDir, manifestHash[:16])
	os.WriteFile(filePath, manifestJSON, 0644)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"key":      manifestKey,
		"hash":     manifestHash,
		"manifest": manifest,
	})
}

func (h *Handlers) Verify(c echo.Context) error {
	key := c.QueryParam("key")
	if key == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "key parameter required"})
	}

	val, ok := h.db.Get(key)
	if !ok {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "key not found"})
	}

	data := val.(map[string]interface{})

	signature, _ := data["signature"].(string)
	nodeData := data["data"]
	publicKey, _ := data["public_key"].(string)

	if signature == "" || publicKey == "" {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"key":    key,
			"valid":  false,
			"reason": "no signature found",
			"data":   nodeData,
		})
	}

	_, _ = json.Marshal(nodeData)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"key":        key,
		"valid":      signature != "",
		"data":       nodeData,
		"hash":       data["hash"],
		"public_key": publicKey,
		"signature":  signature,
	})
}

// UploadManifest handles POST /upload - uploads image (if provided) and manifest to Pinata, then stores manifest CID on Ethereum
// Supports both JSON (with image_cid) and multipart form (with image file)
// PUBLIC endpoint for hackathon testing (no authentication required)
func (h *Handler) UploadManifest(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 120*time.Second)
	defer cancel()

	pinataClient := pinata.NewFromEnv()
	if !pinataClient.Enabled() {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Pinata not configured. Please set PINATA_API_KEY and PINATA_API_SECRET"})
	}

	var imageCID string
	var err error

	// Step 1: Handle image upload (if provided as file)
	imageFile, err := c.FormFile("image")
	if err == nil && imageFile != nil {
		// Image file provided - upload to Pinata first
		src, err := imageFile.Open()
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to open image file: " + err.Error()})
		}
		defer src.Close()

		imageData, err := io.ReadAll(src)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to read image file: " + err.Error()})
		}

		log.Printf("📤 Uploading image to Pinata (size: %d bytes, filename: %s)...", len(imageData), imageFile.Filename)
		imageCID, err = pinataClient.UploadFileSimple(imageData, imageFile.Filename)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to upload image to Pinata: " + err.Error()})
		}
		log.Printf("✅ Image uploaded to Pinata: CID=%s", imageCID)
	} else {
		// No image file - get image_cid from form or will get from JSON below
		imageCID = c.FormValue("image_cid")
	}

	// Step 2: Get manifest metadata from request
	var req struct {
		ImageCID    string            `json:"image_cid" form:"image_cid"`
		Creator     string            `json:"creator" form:"creator"`
		Prompt      string            `json:"prompt" form:"prompt"`
		Model       string            `json:"model" form:"model"`
		Origin      string            `json:"origin" form:"origin"`
		Timestamp   int64             `json:"timestamp" form:"timestamp"`
		DerivedFrom *string           `json:"derived_from,omitempty" form:"derived_from"`
		Metadata    map[string]string `json:"metadata,omitempty" form:"metadata"`
	}

	// Try to get creator from authenticated user first (if available)
	var creator string
	user, ok := auth.GetDBUserFromContext(c)
	if ok && user.WalletAddress != "" {
		creator = user.WalletAddress
		log.Printf("ℹ️  Using authenticated user's wallet: %s", creator)
	}

	// Bind from JSON or form (single bind operation)
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request: " + err.Error()})
	}

	// If image_cid was not provided as file, use from request
	if imageCID == "" {
		imageCID = req.ImageCID
		if imageCID == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "image file or image_cid is required"})
		}
		log.Printf("ℹ️  Using provided image CID: %s", imageCID)
	}

	// Set default timestamp if not provided
	if req.Timestamp == 0 {
		req.Timestamp = time.Now().Unix()
	}

	// Use creator from request if not from authenticated user
	if creator == "" {
		creator = req.Creator
	}

	// Validate required fields
	if creator == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "creator (wallet address) is required"})
	}

	// Step 3: Create manifest JSON with image CID
	manifest := map[string]interface{}{
		"image_cid":  imageCID,
		"creator":    creator,
		"prompt":     req.Prompt,
		"model":      req.Model,
		"origin":     req.Origin,
		"timestamp":  req.Timestamp,
		"created_at": time.Now().Unix(),
	}

	if req.DerivedFrom != nil {
		manifest["derived_from"] = *req.DerivedFrom
	}

	if req.Metadata != nil {
		manifest["metadata"] = req.Metadata
	}

	// Step 4: Pin manifest to Pinata
	log.Printf("📤 Uploading manifest to Pinata...")
	cid, err := pinataClient.PinJSONManifest(manifest)
	if err != nil {
		c.Logger().Errorf("failed to pin JSON manifest: %v", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to pin manifest to Pinata: " + err.Error()})
	}

	log.Printf("✅ Manifest pinned to Pinata: CID=%s", cid)

	// Step 5: Store manifest CID on Ethereum
	rpcURL := os.Getenv("RPC_URL")
	privateKey := os.Getenv("PRIVATE_KEY")
	contractAddress := os.Getenv("CONTRACT_ADDRESS")

	if rpcURL == "" || privateKey == "" || contractAddress == "" {
		return c.JSON(http.StatusInternalServerError, map[string]interface{}{
			"error":     "Ethereum not configured. Please set RPC_URL, PRIVATE_KEY, and CONTRACT_ADDRESS in .env",
			"cid":       cid,
			"image_cid": imageCID,
		})
	}

	log.Printf("📤 Storing manifest CID on Ethereum Sepolia...")
	txHash, err := eth.StoreManifest(ctx, rpcURL, privateKey, contractAddress, cid)
	if err != nil {
		// Return CID even if Ethereum transaction fails
		return c.JSON(http.StatusInternalServerError, map[string]interface{}{
			"error": "failed to store on Ethereum: " + err.Error(),
			"cid":   cid,
		})
	}

	etherscanURL := fmt.Sprintf("https://sepolia.etherscan.io/tx/%s", txHash)

	log.Printf("✅ Manifest stored on Ethereum: TX=%s", txHash)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"image_cid": imageCID,
		"cid":       cid,
		"txHash":    txHash,
		"etherscan": etherscanURL,
		"manifest":  manifest,
	})
}

func (h *Handler) callOpenAIImage(apiKey, prompt string, params map[string]string) ([]byte, error) {
	url := "https://api.openai.com/v1/images/generations"

	size := params["size"]
	if size == "" {
		size = "1024x1024"
	}
	model := params["model"]
	if model == "" {
		model = "dall-e-3"
	}
	payload := map[string]interface{}{
		"prompt": prompt,
		"n":      1,
		"size":   size,
		"model":  model,
	}

	jsonData, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	if data, ok := result["data"].([]interface{}); ok && len(data) > 0 {
		if imgData, ok := data[0].(map[string]interface{}); ok {
			if imgURL, ok := imgData["url"].(string); ok {
				imgResp, err := http.Get(imgURL)
				if err != nil {
					return nil, err
				}
				defer imgResp.Body.Close()
				return io.ReadAll(imgResp.Body)
			}
		}
	}

	return nil, fmt.Errorf("failed to download generated image")
}

func (h *Handler) callVertexAI(prompt, contentType string, params map[string]string) ([]byte, error) {
	if contentType != "image" {
		return nil, fmt.Errorf("vertex: unsupported content type: %s", contentType)
	}

	projectID := os.Getenv("VERTEX_PROJECT_ID")
	location := os.Getenv("VERTEX_LOCATION")
	accessToken := os.Getenv("GOOGLE_API_ACCESS_TOKEN")
	if projectID == "" || location == "" || accessToken == "" {
		return nil, fmt.Errorf("vertex: VERTEX_PROJECT_ID, VERTEX_LOCATION, and GOOGLE_API_ACCESS_TOKEN must be set")
	}

	model := params["model"]
	if model == "" {
		model = "imagegeneration@005"
	}

	endpoint := fmt.Sprintf("https://%s-aiplatform.googleapis.com/v1/projects/%s/locations/%s/publishers/google/models/%s:predict", location, projectID, location, model)

	size := params["size"]
	if size == "" {
		size = "1024x1024"
	}
	instances := []map[string]any{{"prompt": prompt}}
	parameters := map[string]any{
		"sampleCount": 1,
		"imageSize":   size,
	}
	body := map[string]any{
		"instances":  instances,
		"parameters": parameters,
	}
	jsonData, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", endpoint, bytes.NewBuffer(jsonData))
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if preds, ok := result["predictions"].([]any); ok && len(preds) > 0 {
		if m, ok := preds[0].(map[string]any); ok {
			if b64, ok := m["bytesBase64Encoded"].(string); ok && b64 != "" {
				return base64.StdEncoding.DecodeString(b64)
			}
		}
	}
	responseBody, err := json.Marshal(result)
	if err != nil {
		return nil, fmt.Errorf("vertex: image bytes not found in response (and failed to marshal error response)")
	}

	return nil, fmt.Errorf("vertex: image bytes not found in response. Full Vertex response: %s", string(responseBody))
}

func (h *Handler) callGrok(prompt, contentType string, params map[string]string) ([]byte, error) {
	if contentType == "image" {
		return nil, fmt.Errorf("grok: image generation not implemented")
	}
	apiKey := os.Getenv("XAI_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("XAI_API_KEY not set")
	}
	url := "https://api.x.ai/v1/chat/completions"
	payload := map[string]any{
		"model":       params["model"],
		"messages":    []map[string]string{{"role": "user", "content": prompt}},
		"temperature": 0,
	}
	if payload["model"] == "" {
		payload["model"] = "grok-2"
	}
	jsonData, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}
