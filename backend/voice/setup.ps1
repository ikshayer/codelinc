$ErrorActionPreference = 'Stop'
$voiceRoot = $PSScriptRoot
$pythonPath = Join-Path $voiceRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    & uv venv (Join-Path $voiceRoot '.venv') --python 3.11
    if ($LASTEXITCODE -ne 0) { throw 'Creating the voice environment failed.' }
}
& uv pip install --python $pythonPath -r (Join-Path $voiceRoot 'requirements.txt') --override (Join-Path $voiceRoot 'torch-overrides.txt') --extra-index-url https://download.pytorch.org/whl/cu128 --index-strategy unsafe-best-match
if ($LASTEXITCODE -ne 0) { throw 'Installing the voice dependencies failed.' }
& $pythonPath -c "import torch; print('PyTorch:', torch.__version__); print('CUDA available:', torch.cuda.is_available()); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'unavailable')"
