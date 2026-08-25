package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"time"
)

func capturePrimaryScreen() ([]byte, error) {
	if runtime.GOOS != "windows" {
		return nil, fmt.Errorf("screenshot capture is currently supported on Windows only")
	}

	dir := os.TempDir()
	path := filepath.Join(dir, fmt.Sprintf("evoca-screenshot-%d.png", time.Now().UnixNano()))
	escaped := strings.ReplaceAll(path, "'", "''")
	script := "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; Add-Type @'\nusing System; using System.Runtime.InteropServices; public static class EvocaScreen { [DllImport(\"user32.dll\")] public static extern int GetSystemMetrics(int nIndex); }\n'@; $w=[EvocaScreen]::GetSystemMetrics(0); $h=[EvocaScreen]::GetSystemMetrics(1); $bmp=New-Object System.Drawing.Bitmap $w,$h; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(0,0,0,0,(New-Object System.Drawing.Size($w,$h))); $bmp.Save('" + escaped + "',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose(); Write-Output \"$w,$h\""
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	// Never show the PowerShell console while capturing the desktop.
	// Otherwise the console can cover the target area and can be captured itself.
	hideConsoleWindow(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		_ = os.Remove(path)
		return nil, fmt.Errorf("capture screen: %w: %s", err, strings.TrimSpace(string(out)))
	}
	data, err := os.ReadFile(path)
	_ = os.Remove(path)
	if err != nil {
		return nil, err
	}
	return data, nil
}

func cropPNG(data []byte, x, y, w, h, viewportW, viewportH int) (string, error) {
	if w <= 0 || h <= 0 || viewportW <= 0 || viewportH <= 0 {
		return "", fmt.Errorf("invalid screenshot selection")
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("decode screenshot: %w", err)
	}
	bounds := src.Bounds()
	sx := float64(bounds.Dx()) / float64(viewportW)
	sy := float64(bounds.Dy()) / float64(viewportH)
	left := int(float64(x) * sx)
	top := int(float64(y) * sy)
	right := int(float64(x+w) * sx)
	bottom := int(float64(y+h) * sy)
	if left < 0 {
		left = 0
	}
	if top < 0 {
		top = 0
	}
	if right > bounds.Dx() {
		right = bounds.Dx()
	}
	if bottom > bounds.Dy() {
		bottom = bounds.Dy()
	}
	if right <= left || bottom <= top {
		return "", fmt.Errorf("selection is outside captured screen")
	}

	dst := image.NewRGBA(image.Rect(0, 0, right-left, bottom-top))
	for dy := 0; dy < dst.Bounds().Dy(); dy++ {
		for dx := 0; dx < dst.Bounds().Dx(); dx++ {
			dst.Set(dx, dy, src.At(left+dx, top+dy))
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, dst); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}
