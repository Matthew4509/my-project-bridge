# Opens the Windows "Open" dialog for one .zip file and prints the chosen path. Prints nothing when the person cancels.
# Run by the Bridge (lib/platform/windows.js) with a fixed title; nothing typed into the page reaches here.
# -CompileOnly loads what the dialog needs and exits without showing it (used by the tests).
param([string]$Title = 'Select a zip', [switch]$CompileOnly)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
if ($CompileOnly) { 'compiled'; exit 0 }

# An invisible, always-on-top owner window, so the dialog opens in front of the Bridge instead of behind it.
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true; $owner.ShowInTaskbar = $false; $owner.Opacity = 0
$owner.StartPosition = 'CenterScreen'; $owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Show(); $owner.Activate()
try {
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Title = $Title
    $dlg.Filter = 'Zip files (*.zip)|*.zip'
    $dlg.CheckFileExists = $true
    $dlg.Multiselect = $false
    $dlg.InitialDirectory = [Environment]::GetFolderPath('UserProfile') + '\Downloads'
    if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dlg.FileName) }
} finally { $owner.Close() }
