# Kaam Match

## Worker profile deletion

Deleting a worker profile requires an SMS verification code sent with Twilio Verify. Set these environment variables before starting the server:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`
- `PHONE_COUNTRY_CODE` (optional; defaults to `+91`)

The Twilio Verify service must be configured to send SMS messages. The website accepts 10-digit local phone numbers and combines them with `PHONE_COUNTRY_CODE` when requesting verification. Keep Twilio credentials in the hosting environment; do not commit them to the project.

Start the app with `npm start`.
