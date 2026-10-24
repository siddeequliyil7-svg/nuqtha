[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
    $wc = New-Object Net.WebClient
    $url = "https://firestore.googleapis.com/v1/projects/nuqtha-c0900/databases/(default)/documents/articles?key=AIzaSyBTKoMKudzOtgv-BY5jlgs7dNl62S9e"
    $res = $wc.DownloadString($url)
    Set-Content -Path "test_output.json" -Value $res
    Write-Host "DOWNLOAD_SUCCESS"
} catch {
    $err = $_.Exception.ToString()
    Set-Content -Path "test_output.json" -Value $err
    Write-Host "DOWNLOAD_ERROR"
}
