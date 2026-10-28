# uninstall.cmd's "Also put this folder in the Recycle Bin?" (tools/setup.js), run from a copy in Temp: waits for the
# uninstall window (it holds the Bridge's folder open) to close, then moves each folder to the Recycle Bin, so it can
# still be brought back. Only a folder holding server.js is moved: a Bridge, never a projects folder. Then it removes
# its own copy. Nothing typed into the page reaches here. The folders come in BRIDGE_RECYCLE_PATHS (|-separated) and the
# window's process id in BRIDGE_RECYCLE_WAIT, so a name with spaces or & needs no quoting on the way.
param([int]$WaitFor = $env:BRIDGE_RECYCLE_WAIT, [string]$Paths = $env:BRIDGE_RECYCLE_PATHS)
if (-not $Paths) { exit 1 }
try { Wait-Process -Id $WaitFor -Timeout 3600 -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Seconds 1
Add-Type -AssemblyName Microsoft.VisualBasic
foreach ($p in $Paths.Split('|')) {
    if ($p -and (Test-Path -LiteralPath (Join-Path $p 'server.js'))) {
        try { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin') } catch {}
    }
}
Remove-Item -LiteralPath $PSCommandPath -Force
