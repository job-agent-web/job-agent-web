param(
  [int]$Limit = 100,
  [int]$Offset = 0,
  [int]$DelayMs = 1200,
  [string]$Provider = "Google"
)

$ErrorActionPreference = "Continue"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebRoot = Join-Path $Root "job-agent-web"
$DirectoryPath = Join-Path $Root "sponsor_website_directory.json"
$CachePath = Join-Path $Root "sponsor_websites.json"
$BrowserCachePath = Join-Path $Root "sponsor_websites.js"
$WebDirectoryPath = Join-Path $WebRoot "sponsor_website_directory.json"
$WebCachePath = Join-Path $WebRoot "sponsor_websites.json"
$WebBrowserCachePath = Join-Path $WebRoot "sponsor_websites.js"

function Normalize-SponsorKey {
  param([string]$Name)
  if (-not $Name) { return "" }
  $value = $Name.ToLowerInvariant()
  $value = [regex]::Replace($value, "\b(t/a|trading as|ta)\b[\s\S]*$", "")
  $value = $value -replace "&", " and "
  $value = [regex]::Replace($value, "[^a-z0-9]+", " ")
  $value = [regex]::Replace($value, "\b(ltd|limited|plc|llp|inc|uk|company|group|holdings|services|service)\b", " ")
  $value = [regex]::Replace($value, "\s+", " ").Trim()
  return $value
}

function Get-CompanyTokens {
  param([string]$Company)
  $stop = @{
    "limited" = $true; "ltd" = $true; "plc" = $true; "llp" = $true; "uk" = $true;
    "company" = $true; "services" = $true; "service" = $true; "group" = $true;
    "holdings" = $true; "the" = $true; "and" = $true; "of" = $true;
  }
  return (Normalize-SponsorKey $Company).Split(" ") | Where-Object { $_ -and $_.Length -gt 2 -and -not $stop.ContainsKey($_) } | Select-Object -First 5
}

function Test-BlockedHost {
  param([string]$HostName)
  if (-not $HostName) { return $true }
  return $HostName -match "(^|\.)google\." -or
    $HostName -match "(^|\.)bing\.com$" -or
    $HostName -match "(^|\.)duckduckgo\.com$" -or
    $HostName -match "(^|\.)linkedin\.com$" -or
    $HostName -match "(^|\.)indeed\." -or
    $HostName -match "(^|\.)glassdoor\." -or
    $HostName -match "(^|\.)reed\.co\.uk$" -or
    $HostName -match "(^|\.)totaljobs\.com$" -or
    $HostName -match "(^|\.)cv-library\.co\.uk$" -or
    $HostName -match "(^|\.)facebook\.com$" -or
    $HostName -match "(^|\.)instagram\.com$" -or
    $HostName -match "(^|\.)x\.com$" -or
    $HostName -match "(^|\.)twitter\.com$" -or
    $HostName -match "(^|\.)youtube\.com$" -or
    $HostName -match "(^|\.)wikipedia\.org$" -or
    $HostName -match "(^|\.)gov\.uk$"
}

function Normalize-Homepage {
  param([string]$Url)
  try {
    $uri = [Uri]$Url
    if ($uri.Scheme -notmatch "^https?$") { return "" }
    return "{0}://{1}/" -f $uri.Scheme, $uri.Host.ToLowerInvariant()
  } catch {
    return ""
  }
}

function Test-OfficialWebsite {
  param(
    [string]$Url,
    [string]$Company
  )
  try {
    $uri = [Uri]$Url
    $host = $uri.Host.ToLowerInvariant() -replace "^www\.", ""
  } catch {
    return $false
  }
  if (Test-BlockedHost $host) { return $false }
  $tokens = @(Get-CompanyTokens $Company)
  if ($tokens.Count -eq 0) { return $false }
  if ($tokens.Count -eq 1) { return $host.Contains($tokens[0]) }
  $score = 0
  foreach ($token in $tokens) {
    if ($host.Contains($token)) {
      if ($token.Length -ge 5) { $score += 2 } else { $score += 1 }
    }
  }
  return $score -ge [Math]::Min(3, $tokens.Count + 1)
}

function Decode-SearchUrl {
  param([string]$Url)
  if (-not $Url) { return "" }
  $raw = [System.Net.WebUtility]::HtmlDecode(($Url -replace "&amp;", "&"))
  $uddg = [regex]::Match($raw, "[?&]uddg=([^&]+)", "IgnoreCase")
  $google = [regex]::Match($raw, "/url\?q=([^&]+)", "IgnoreCase")
  $googleAlt = [regex]::Match($raw, "[?&]q=(https?%3A%2F%2F[^&]+)", "IgnoreCase")
  $bing = [regex]::Match($raw, "[?&]u=([^&]+)", "IgnoreCase")
  try {
    if ($uddg.Success) { return [Uri]::UnescapeDataString($uddg.Groups[1].Value) }
    if ($google.Success) { return [Uri]::UnescapeDataString($google.Groups[1].Value) }
    if ($googleAlt.Success) { return [Uri]::UnescapeDataString($googleAlt.Groups[1].Value) }
    if ($bing.Success) {
      $value = [Uri]::UnescapeDataString($bing.Groups[1].Value)
      if ($value -match "^a1") {
        $rawBase64 = $value.Substring(2)
        try { return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($rawBase64)) } catch { return "" }
      }
      if ($value -match "^https?://") { return $value }
    }
  } catch {
    return ""
  }
  if ($raw -match "^https?://") { return $raw }
  return ""
}

function Get-SearchLinks {
  param([string]$SearchUrl)
  $headers = @{
    "Accept" = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    "Accept-Language" = "en-GB,en;q=0.9"
    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
  }
  try {
    $response = Invoke-WebRequest -Uri $SearchUrl -Headers $headers -UseBasicParsing -TimeoutSec 12
    $html = [string]$response.Content
  } catch {
    return @()
  }
  $seen = @{}
  $links = New-Object System.Collections.Generic.List[string]
  foreach ($match in [regex]::Matches($html, 'href="([^"]+)"', "IgnoreCase")) {
    $decoded = Decode-SearchUrl $match.Groups[1].Value
    if ($decoded -and -not $seen.ContainsKey($decoded)) {
      $seen[$decoded] = $true
      [void]$links.Add($decoded)
      if ($links.Count -ge 20) { break }
    }
  }
  return $links
}

function Find-OfficialWebsite {
  param([string]$Company)
  $queries = @(
    '"' + $Company + '" official website UK',
    '"' + $Company + '" careers official website',
    '"' + $Company + '" jobs careers'
  )
  $seen = @{}
  foreach ($query in $queries) {
    $searchUrls = @()
    if ($Provider -eq "All" -or $Provider -eq "Google") {
      $searchUrls += "https://www.google.com/search?num=10&hl=en&q=$([Uri]::EscapeDataString($query))"
    }
    if ($Provider -eq "All" -or $Provider -eq "Bing") {
      $searchUrls += "https://www.bing.com/search?q=$([Uri]::EscapeDataString($query))"
    }
    if ($Provider -eq "All" -or $Provider -eq "DuckDuckGo") {
      $searchUrls += "https://html.duckduckgo.com/html/?q=$([Uri]::EscapeDataString($query))"
    }
    foreach ($searchUrl in $searchUrls) {
      foreach ($link in Get-SearchLinks $searchUrl) {
        $candidate = Normalize-Homepage $link
        if (-not $candidate -or $seen.ContainsKey($candidate)) { continue }
        $seen[$candidate] = $true
        if (Test-OfficialWebsite $candidate $Company) {
          return $candidate
        }
      }
      Start-Sleep -Milliseconds $DelayMs
    }
  }
  return ""
}

function Write-CacheFiles {
  param($Cache, $Directory)
  $Cache._meta.generated_at = (Get-Date).ToString("yyyy-MM-dd")
  $Cache._meta.count = ($Cache.websites.PSObject.Properties | Measure-Object).Count
  $Cache | ConvertTo-Json -Depth 8 | Set-Content -Path $CachePath -Encoding UTF8
  "window.SPONSOR_WEBSITE_CACHE = $($Cache | ConvertTo-Json -Depth 8);" | Set-Content -Path $BrowserCachePath -Encoding UTF8
  $Directory | ConvertTo-Json -Depth 8 | Set-Content -Path $DirectoryPath -Encoding UTF8
  if (Test-Path $WebRoot) {
    Copy-Item -Path $CachePath -Destination $WebCachePath -Force
    Copy-Item -Path $BrowserCachePath -Destination $WebBrowserCachePath -Force
    Copy-Item -Path $DirectoryPath -Destination $WebDirectoryPath -Force
  }
}

if (-not (Test-Path $DirectoryPath)) {
  throw "Missing sponsor_website_directory.json. Generate the full sponsor directory first."
}

$directory = Get-Content $DirectoryPath -Raw | ConvertFrom-Json
$cache = Get-Content $CachePath -Raw | ConvertFrom-Json
if (-not $cache.websites) {
  $cache | Add-Member -MemberType NoteProperty -Name websites -Value ([pscustomobject]@{})
}

$pending = @($directory.sponsors | Where-Object { $_.status -ne "verified" -and $_.organisation_name } | Select-Object -Skip $Offset -First $Limit)
$found = 0
$checked = 0

foreach ($sponsor in $pending) {
  $checked += 1
  $company = [string]$sponsor.organisation_name
  $key = Normalize-SponsorKey $company
  if (-not $key) { continue }

  Write-Host "Checking $checked/$($pending.Count): $company"
  $website = Find-OfficialWebsite $company
  if (-not $website) {
    $sponsor.status = "not_found"
    $sponsor.verified = $false
    continue
  }

  $found += 1
  $sponsor.website = $website
  $sponsor.careersUrl = $website
  $sponsor.verified = $true
  $sponsor.status = "verified"

  $cache.websites | Add-Member -MemberType NoteProperty -Name $key -Value ([pscustomobject]@{
    company = $company
    website = $website
    careersUrl = $website
    verified = $true
    source = "search-verified"
    checkedAt = (Get-Date).ToString("yyyy-MM-dd")
  }) -Force

  Write-Host "  found => $website"
  Write-CacheFiles $cache $directory
}

$directory._meta.generated_at = (Get-Date).ToString("yyyy-MM-dd")
$directory._meta.verified_website_record_count = @($directory.sponsors | Where-Object { $_.verified -eq $true }).Count
Write-CacheFiles $cache $directory

Write-Host "Finished. Checked: $checked. New websites found: $found. Total verified cache entries: $(($cache.websites.PSObject.Properties | Measure-Object).Count)."
