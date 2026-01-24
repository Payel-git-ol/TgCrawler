# Script to send all valid tasks to Deadline Bot

Write-Host "Starting task sending..." -ForegroundColor Cyan

$uri = "http://localhost:3000/tasks/send-all-unsent"

try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -ContentType "application/json"
    
    Write-Host "`nResults:" -ForegroundColor Green
    Write-Host "Total tasks: $($response.statistics.total)"
    Write-Host "Sent: $($response.statistics.sent)" -ForegroundColor Green
    Write-Host "Filtered: $($response.statistics.failed)" -ForegroundColor Yellow
    
    if ($response.errors -and $response.errors.Count -gt 0) {
        Write-Host "`nSkipped tasks:" -ForegroundColor Yellow
        foreach ($err in $response.errors | Select-Object -First 10) {
            Write-Host "  - $err"
        }
        if ($response.errors.Count -gt 10) {
            Write-Host "  ... and $($response.errors.Count - 10) more"
        }
    }
    
    Write-Host "`nDone!" -ForegroundColor Cyan
    
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}
