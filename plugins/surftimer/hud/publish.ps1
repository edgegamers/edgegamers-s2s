<#
.SYNOPSIS
  Compile the SurfTimer HUD workshop addon and publish it to the Steam Workshop in one step.

.DESCRIPTION
  1. Copies hud/workshop/ into <CS2>\content\csgo_addons\<Addon>\ (the addon's source root).
  2. Compiles the Panorama layout and stylesheet with Valve's resourcecompiler (installed with the
     CS2 Workshop Tools), which writes the compiled files to <CS2>\game\csgo_addons\<Addon>\.
  3. Packs and uploads that compiled addon with CS2WorkshopManager-CLI
     (https://github.com/Angel-foxxo/CS2-Workshop-Manager).

  Needs Windows, CS2 with the Workshop Tools installed, and Steam running and signed in to the
  account that owns the workshop item.

.PARAMETER Id
  Workshop id of the published HUD item. Leave it out the first time: a new private item is created
  and its id printed. Put that id in the HUD plugin's `workshop_addon` config and pass it here from
  then on.

.EXAMPLE
  ./hud/publish.ps1 -Cli C:\tools\CS2WorkshopManager-CLI.exe
  ./hud/publish.ps1 -Cli C:\tools\CS2WorkshopManager-CLI.exe -Id 3790000000 -Visibility unlisted
#>
param(
  [string]$Cli = "CS2WorkshopManager-CLI",
  [string]$Cs2 = "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive",
  [string]$Addon = "surftimer_hud",
  [string]$Id = "",
  [string]$Visibility = "",
  [string]$ChangeNote = ""
)
$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$src = Join-Path $PSScriptRoot "workshop"
$content = Join-Path $Cs2 "content\csgo_addons\$Addon"
$compiler = Join-Path $Cs2 "game\bin\win64\resourcecompiler.exe"
if (-not (Test-Path $compiler)) { throw "resourcecompiler.exe not found at $compiler. Install the CS2 Workshop Tools, or pass -Cs2 <install folder>." }

# 1. Source into the addon's content root (a mirror: files deleted from the repo are removed there too).
New-Item -ItemType Directory -Force -Path $content | Out-Null
robocopy $src $content /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copying $src to $content failed (robocopy exit $LASTEXITCODE)." }

# 2. Compile. The layout includes the stylesheet by its source path, so both are compiled explicitly.
$files = @(
  "panorama\layout\custom_game\surftimer_hud.xml",
  "panorama\styles\custom_game\surftimer_hud.css"
)
foreach ($f in $files) {
  & $compiler -i (Join-Path $content $f)
  if ($LASTEXITCODE -ne 0) { throw "resourcecompiler failed on $f (exit $LASTEXITCODE)." }
}

# 3. Pack + publish.
$sha = (git -C $repo rev-parse --short HEAD 2>$null)
if (-not $ChangeNote) { $ChangeNote = if ($sha) { "SurfTimer HUD build $sha" } else { "SurfTimer HUD update" } }
$cliArgs = @("upload", "--addon", $Addon, "--game", $Cs2, "--changenote", $ChangeNote)
if ($Id) {
  $cliArgs += @("--id", $Id)
} else {
  # A content addon, not a map: no "Map" tag, so it stays out of the in-game map browsers.
  $cliArgs += @("--title", "SurfTimer HUD", "--tags_dangerous", "CS2",
             "--description", "Panorama HUD for the s2script SurfTimer plugin (s2script/s2s-surftimer). Mount it with MultiAddonManager.")
}
if ($Visibility) { $cliArgs += @("--visibility", $Visibility) }
& $Cli @cliArgs
if ($LASTEXITCODE -ne 0) { throw "CS2WorkshopManager-CLI upload failed (exit $LASTEXITCODE)." }
