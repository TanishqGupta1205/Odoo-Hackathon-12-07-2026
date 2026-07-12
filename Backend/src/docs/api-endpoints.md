# Suggested API Endpoints

## Auth
- POST `/api/auth/register`
- POST `/api/auth/login`
- GET `/api/auth/me`

## Vehicles
- GET `/api/vehicles`
- POST `/api/vehicles`
- GET `/api/vehicles/:id`
- PATCH `/api/vehicles/:id`
- DELETE `/api/vehicles/:id`

## Drivers
- GET `/api/drivers`
- POST `/api/drivers`
- GET `/api/drivers/:id`
- PATCH `/api/drivers/:id`
- DELETE `/api/drivers/:id`

## Trips
- GET `/api/trips`
- POST `/api/trips`
- POST `/api/trips/:id/dispatch`
- POST `/api/trips/:id/complete`
- POST `/api/trips/:id/cancel`

## Maintenance
- POST `/api/maintenance`
- POST `/api/maintenance/:id/close`

## Fuel and Expenses
- POST `/api/fuel-logs`
- POST `/api/expenses`

## Dashboard and Reports
- GET `/api/dashboard/kpis`
- GET `/api/reports/vehicle/:vehicleId`
- GET `/api/reports/export.csv`
