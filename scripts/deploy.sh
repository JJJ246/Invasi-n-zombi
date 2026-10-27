#!/usr/bin/env bash
# Despliega todo en AWS: infraestructura (SAM) + web (S3/CloudFront).
# Requisitos: AWS CLI y AWS SAM CLI configurados con tus credenciales (nunca en el código).
# Uso: ALERT_EMAIL=tu@correo.com ./scripts/deploy.sh
set -euo pipefail

STACK="${STACK:-plaga-zombie-manta}"
REGION="${AWS_REGION:-us-east-1}"
EMAIL="${ALERT_EMAIL:?Define ALERT_EMAIL con el correo para la alerta del presupuesto}"
BUDGET="${MONTHLY_BUDGET_USD:-5}"

cd "$(dirname "$0")/.."

echo "==> Tests"
npm test --silent

echo "==> Infraestructura ($STACK en $REGION)"
sam deploy \
  --template-file infra/template.yaml \
  --stack-name "$STACK" \
  --region "$REGION" \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "AlertEmail=$EMAIL" "MonthlyBudgetUsd=$BUDGET"

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
API_URL="$(output ApiUrl)"
WEB_URL="$(output WebUrl)"
BUCKET="$(output WebBucketName)"
DISTRIBUTION="$(output DistributionId)"

echo "==> Web"
node scripts/build-web.mjs "$API_URL"
aws s3 sync dist "s3://$BUCKET" --delete --region "$REGION"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/*" --query 'Invalidation.Id' --output text

echo
echo "Listo."
echo "  Web: $WEB_URL"
echo "  API: $API_URL"
