/** The SDK resolves local credentials or the temporary ECS task-role credentials. */
export function awsCredentialsAvailable() {
  return Boolean((process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
    process.env.AWS_WEB_IDENTITY_TOKEN_FILE || process.env.AWS_PROFILE);
}
