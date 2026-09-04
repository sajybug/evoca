package app

// Version is the application version shown by the About page. Release builds
// can override this value with -ldflags without changing the frontend.
var Version = "0.1.0"

// AppInfo contains user-facing application metadata.
type AppInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Purpose string `json:"purpose"`
}

func GetAppInfo() AppInfo {
	return AppInfo{
		Name:    "eVoca",
		Version: Version,
		Purpose: "A Windows-first launcher for reusable AI configurations. Press the global hotkey, choose a configuration, enter your input, and get the result without leaving your current application.",
	}
}
