$raw = Get-Content "test_output.json" -Raw | ConvertFrom-Json
foreach ($d in $raw.documents) {
    $id = $d.name.Split('/')[-1]
    $t = $d.fields.createdAt
    $title = $d.fields.title.stringValue
    Write-Host "DOC: $id | TITLE: $title | CREATED_AT: $($t | ConvertTo-Json -Compress)"
}
