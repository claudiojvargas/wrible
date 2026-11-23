[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

Write-Host 'Monitores ativos na sessão do Windows'
[System.Windows.Forms.Screen]::AllScreens |
    Select-Object DeviceName, Primary,
        @{Name = 'X'; Expression = { $_.Bounds.X }},
        @{Name = 'Y'; Expression = { $_.Bounds.Y }},
        @{Name = 'Width'; Expression = { $_.Bounds.Width }},
        @{Name = 'Height'; Expression = { $_.Bounds.Height }} |
    Format-Table -AutoSize

Write-Host 'Pacote instalado do Virtual Display Driver'
$drivers = Get-CimInstance -ClassName Win32_PnPSignedDriver -Filter "DeviceClass = 'DISPLAY'" |
    Where-Object { $_.DeviceName -eq 'Virtual Display Driver' -and $_.DriverProviderName -eq 'MikeTheTech' }

if ($drivers) {
    $drivers | Format-Table DeviceName, DriverVersion, InfName, IsSigned, Signer -AutoSize
} else {
    Write-Host 'O pacote MikeTheTech não foi encontrado entre os adaptadores de vídeo.'
}
