#!/usr/bin/env bash
# Run once as root on a fresh Ubuntu 22.04 x86_64 GPU host. See DEPLOYMENT.md.
set -euo pipefail

[[ ${EUID} -eq 0 ]] || { echo 'Run this script through sudo.' >&2; exit 1; }
for name in AWS_REGION JOBS_TABLE JOBS_QUEUE_URL ASSETS_BUCKET OPENAI_SECRET_ARN WORKER_ARTIFACT_URI TRELLIS_REF; do
  [[ -n ${!name:-} ]] || { echo "Missing environment variable: $name" >&2; exit 1; }
  [[ ${!name} != *$'\n'* && ${!name} != *$'\r'* && ${!name} != *'"'* && ${!name} != *\\* ]] || {
    echo "Invalid character in $name" >&2; exit 1;
  }
done
[[ $TRELLIS_REF =~ ^[a-fA-F0-9]{40}$ ]] || { echo 'TRELLIS_REF must be a reviewed, full 40-character commit SHA.' >&2; exit 1; }
[[ $WORKER_ARTIFACT_URI == s3://* ]] || { echo 'WORKER_ARTIFACT_URI must be an S3 URI.' >&2; exit 1; }
[[ $(uname -m) == x86_64 ]] || { echo 'This bootstrap targets x86_64.' >&2; exit 1; }

CONDA_EXE=${CONDA_EXE:-/opt/conda/bin/conda}
CUDA_HOME=${CUDA_HOME:-/usr/local/cuda-11.8}
INSTALL_DIR=/opt/asset-pipeline
ENV_DIR=$INSTALL_DIR/env
TRELLIS_DIR=$INSTALL_DIR/TRELLIS
APP_DIR=$INSTALL_DIR/app
STATE_DIR=/var/lib/asset-pipeline
export CUDA_HOME
export PATH="$CUDA_HOME/bin:$PATH"
[[ -x $CONDA_EXE ]] || { echo "Install Conda first, or set CONDA_EXE; missing $CONDA_EXE" >&2; exit 1; }
[[ -x $CUDA_HOME/bin/nvcc ]] || { echo "CUDA 11.8 Toolkit (including nvcc) is required at $CUDA_HOME." >&2; exit 1; }
"$CUDA_HOME/bin/nvcc" --version | grep -q 'release 11.8' || { echo 'This recipe requires CUDA Toolkit 11.8.' >&2; exit 1; }
nvidia-smi
command -v aws >/dev/null || { echo 'Install AWS CLI v2 first.' >&2; exit 1; }
[[ ! -e $INSTALL_DIR ]] || { echo "$INSTALL_DIR exists. Use a fresh host or review an upgrade manually." >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y build-essential cmake ninja-build git unzip pkg-config libgl1 libglib2.0-0 libegl1-mesa-dev libgles2-mesa-dev libglvnd-dev
id assetworker >/dev/null 2>&1 || useradd --system --create-home --home-dir "$STATE_DIR" --shell /usr/sbin/nologin assetworker
install -d -o assetworker -g assetworker -m 0755 "$INSTALL_DIR" "$APP_DIR" "$STATE_DIR" "$STATE_DIR/jobs" "$STATE_DIR/cache" "$STATE_DIR/tmp"

# No access keys or API tokens are written here. AWS SDKs use the instance role.
aws s3 cp "$WORKER_ARTIFACT_URI" "$INSTALL_DIR/worker.zip" --region "$AWS_REGION" --only-show-errors
unzip -q "$INSTALL_DIR/worker.zip" -d "$APP_DIR"
[[ -f $APP_DIR/worker.py && -f $APP_DIR/requirements-worker.txt ]] || { echo 'The ZIP must contain worker.py and requirements-worker.txt at its root.' >&2; exit 1; }
chown -R assetworker:assetworker "$INSTALL_DIR" "$STATE_DIR"

runuser -u assetworker -- git clone --recursive https://github.com/microsoft/TRELLIS.git "$TRELLIS_DIR"
runuser -u assetworker -- git -C "$TRELLIS_DIR" checkout --detach "$TRELLIS_REF"
runuser -u assetworker -- git -C "$TRELLIS_DIR" submodule update --init --recursive
runuser -u assetworker -- "$CONDA_EXE" create --yes --prefix "$ENV_DIR" python=3.10 pytorch==2.4.0 torchvision==0.19.0 pytorch-cuda=11.8 -c pytorch -c nvidia

# Upstream original TRELLIS setup. The CUDA extensions may take a long time to build.
# This installs nvdiffrast and other components with separate licenses; see DEPLOYMENT.md.
runuser -u assetworker -- env CUDA_HOME="$CUDA_HOME" PATH="$CUDA_HOME/bin:$PATH" TRELLIS_DIR="$TRELLIS_DIR" \
  "$CONDA_EXE" run --no-capture-output --prefix "$ENV_DIR" bash -e -c \
  'cd "$TRELLIS_DIR"; source ./setup.sh --basic --xformers --diffoctreerast --spconv --mipgaussian --kaolin --nvdiffrast'
runuser -u assetworker -- "$ENV_DIR/bin/python" -m pip install -r "$APP_DIR/requirements-worker.txt"

# A CUDA import check is useful but is not an end-to-end generation test.
runuser -u assetworker -- env PYTHONPATH="$TRELLIS_DIR" ATTN_BACKEND=xformers \
  "$ENV_DIR/bin/python" -c 'import torch; assert torch.cuda.is_available(), "CUDA unavailable"; from trellis.pipelines import TrellisImageTo3DPipeline; print(torch.__version__, torch.version.cuda, torch.cuda.get_device_name(0))'

install -d -m 0755 /etc/asset-pipeline
umask 077
cat > /etc/asset-pipeline/worker.env <<EOF
AWS_REGION="$AWS_REGION"
AWS_DEFAULT_REGION="$AWS_REGION"
JOBS_TABLE="$JOBS_TABLE"
JOBS_QUEUE_URL="$JOBS_QUEUE_URL"
ASSETS_BUCKET="$ASSETS_BUCKET"
OPENAI_SECRET_ARN="$OPENAI_SECRET_ARN"
WORK_DIR="$STATE_DIR/jobs"
TRELLIS_ROOT="$TRELLIS_DIR"
PYTHONPATH="$TRELLIS_DIR"
ATTN_BACKEND="xformers"
SPCONV_ALGO="native"
HF_HOME="$STATE_DIR/cache/huggingface"
TORCH_HOME="$STATE_DIR/cache/torch"
XDG_CACHE_HOME="$STATE_DIR/cache"
TMPDIR="$STATE_DIR/tmp"
CUDA_HOME="$CUDA_HOME"
PYTHONUNBUFFERED="1"
EOF
chmod 0600 /etc/asset-pipeline/worker.env

cat > /etc/systemd/system/asset-worker.service <<EOF
[Unit]
Description=Queued original TRELLIS asset worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=assetworker
Group=assetworker
WorkingDirectory=$APP_DIR
EnvironmentFile=/etc/asset-pipeline/worker.env
Environment="PATH=$ENV_DIR/bin:$CUDA_HOME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=$ENV_DIR/bin/python $APP_DIR/worker.py
Restart=on-failure
RestartSec=10
TimeoutStopSec=90
UMask=0077
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 /etc/systemd/system/asset-worker.service
systemctl daemon-reload
echo 'Bootstrap complete. Review /etc/asset-pipeline/worker.env and start with:'
echo '  sudo systemctl enable --now asset-worker'
echo '  sudo journalctl -u asset-worker -f'
