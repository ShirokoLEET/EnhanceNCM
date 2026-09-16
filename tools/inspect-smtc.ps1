param([ValidateSet('inspect', 'play', 'pause', 'next', 'previous')][string]$Action = 'inspect')
# Inspect CloudMusic's Windows media session, or explicitly test one OS control.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
function Wait-WinRtOperation($Operation, $ResultType) {
    $adapter = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
    $task = $adapter.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    if (-not $task.Wait(5000)) { throw 'Windows media session request timed out' }
    return $task.Result
}
$manager = Wait-WinRtOperation ($managerType::RequestAsync()) $managerType
if ($Action -ne 'inspect') {
    $session = $manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match 'cloudmusic|netease' } | Select-Object -First 1
    if (-not $session) { throw 'CloudMusic media session is unavailable' }
    $operation = switch ($Action) {
        'play' { $session.TryPlayAsync() }
        'pause' { $session.TryPauseAsync() }
        'next' { $session.TrySkipNextAsync() }
        'previous' { $session.TrySkipPreviousAsync() }
    }
    $accepted = Wait-WinRtOperation $operation ([bool])
    Write-Output "SMTC $Action accepted: $accepted"
}
$result = @($manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match 'cloudmusic|netease' } | ForEach-Object {
    $properties = Wait-WinRtOperation ($_.TryGetMediaPropertiesAsync()) $propertiesType
    $playback = $_.GetPlaybackInfo()
    $timeline = $_.GetTimelineProperties()
    [PSCustomObject]@{
        Application = $_.SourceAppUserModelId
        Title = $properties.Title
        Artist = $properties.Artist
        Album = $properties.AlbumTitle
        HasArtwork = $null -ne $properties.Thumbnail
        Status = [string]$playback.PlaybackStatus
        CanPlay = $playback.Controls.IsPlayEnabled
        CanPause = $playback.Controls.IsPauseEnabled
        CanNext = $playback.Controls.IsNextEnabled
        CanPrevious = $playback.Controls.IsPreviousEnabled
        PositionSeconds = $timeline.Position.TotalSeconds
        DurationSeconds = $timeline.EndTime.TotalSeconds
        MinSeekSeconds = $timeline.MinSeekTime.TotalSeconds
        MaxSeekSeconds = $timeline.MaxSeekTime.TotalSeconds
    }
})
ConvertTo-Json -InputObject $result -Depth 3
