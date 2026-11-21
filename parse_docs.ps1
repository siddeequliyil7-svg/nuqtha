$raw = Get-Content "test_output.json" -Raw | ConvertFrom-Json
foreach ($d in $raw.documents) {
    $id = $d.name.Split('/')[-1]
    $title = $d.fields.title.stringValue
    $cat = $d.fields.category.stringValue
    Write-Host "DOC_ID: $id | TITLE: $title | CAT: $cat"
}
