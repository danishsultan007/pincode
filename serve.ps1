# Tiny static file server for the Mohalla prototype.
# Run over localhost (not file://) so geolocation and Nominatim requests work.
param(
  [int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 8080 })
)

$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host "Could not start server on port $Port. It may already be in use." -ForegroundColor Red
  Write-Host $_.Exception.Message
  exit 1
}

Write-Host "pincode is running at $prefix" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".ico"  = "image/x-icon"
  ".png"  = "image/png"
  ".svg"  = "image/svg+xml"
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      $localPath = $request.Url.LocalPath
      if ($localPath -eq "/") { $localPath = "/index.html" }
      $filePath = Join-Path $root ($localPath.TrimStart("/"))

      # Prevent path traversal outside the project root.
      $resolvedRoot = (Resolve-Path $root).Path
      $resolvedFile = $null
      if (Test-Path -LiteralPath $filePath -PathType Leaf) { $resolvedFile = (Resolve-Path -LiteralPath $filePath).Path }

      if ($resolvedFile -and $resolvedFile.StartsWith($resolvedRoot)) {
        $ext = [System.IO.Path]::GetExtension($filePath)
        $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentType = $contentType
        $response.ContentLength64 = [int64]$bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $localPath")
        $response.StatusCode = 404
        $response.ContentLength64 = [int64]$notFound.Length
        $response.OutputStream.Write($notFound, 0, $notFound.Length)
      }
    } catch {
      Write-Host "Request error: $($_.Exception.Message)" -ForegroundColor Red
      try { $response.StatusCode = 500 } catch {}
    } finally {
      try { $response.OutputStream.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
