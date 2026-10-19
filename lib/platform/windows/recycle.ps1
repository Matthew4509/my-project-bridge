# Moves one folder to the Recycle Bin (About > Updates > Remove the old copy), so it can still be brought back.
# Run by the Bridge (lib/platform/windows.js) with a folder the Bridge itself made beside its own; nothing typed into
# the page reaches here.
param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName Microsoft.VisualBasic
[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($Path, 'OnlyErrorDialogs', 'SendToRecycleBin')
