package handlers

import (
	"fmt"
	"mime/multipart"
	"path"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func (h *Handler) requireStore(c *fiber.Ctx) error {
	if h.store == nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{
			"error": "object storage not configured (set MINIO_ENDPOINT)",
		})
	}
	return nil
}

func readImageUpload(c *fiber.Ctx) (*multipart.FileHeader, string, string, error) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		return nil, "", "", badRequest(c, "multipart field 'file' is required")
	}
	if fileHeader.Size <= 0 {
		return nil, "", "", badRequest(c, "empty file")
	}
	if fileHeader.Size > 10*1024*1024 {
		return nil, "", "", badRequest(c, "file too large (max 10MB)")
	}
	contentType := fileHeader.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if !strings.HasPrefix(contentType, "image/") {
		return nil, "", "", badRequest(c, "file must be an image")
	}
	ext := ".jpg"
	switch contentType {
	case "image/png":
		ext = ".png"
	case "image/webp":
		ext = ".webp"
	case "image/gif":
		ext = ".gif"
	case "image/jpeg", "image/jpg":
		ext = ".jpg"
	}
	return fileHeader, contentType, ext, nil
}

// AdminUploadContentMedia stores a CMS image in MinIO (hero, highlights, etc.).
// POST multipart field "file"; optional "folder" (default "cms").
func (h *Handler) AdminUploadContentMedia(c *fiber.Ctx) error {
	if err := h.requireStore(c); err != nil {
		return err
	}

	fileHeader, contentType, ext, err := readImageUpload(c)
	if err != nil {
		return err
	}

	folder := strings.Trim(strings.TrimSpace(c.FormValue("folder")), "/")
	if folder == "" {
		folder = "cms"
	}
	folder = path.Clean(folder)
	if folder == "." || strings.Contains(folder, "..") {
		return badRequest(c, "invalid folder")
	}

	src, err := fileHeader.Open()
	if err != nil {
		return internalError(c, "AdminUploadContentMedia open file", err)
	}
	defer src.Close()

	objectKey := fmt.Sprintf("%s/%s%s", folder, uuid.NewString(), ext)
	publicURL, err := h.store.Put(c.Context(), objectKey, src, fileHeader.Size, contentType)
	if err != nil {
		return internalError(c, "AdminUploadContentMedia put object", err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"url":        publicURL,
		"object_key": objectKey,
	})
}
