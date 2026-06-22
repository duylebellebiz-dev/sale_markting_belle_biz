// Re-export the Prisma-generated enum so the rest of the app has a single
// import point.  The Prisma @map decorators ensure the DB stores human-readable
// strings ("Closed Won", etc.) while TypeScript uses the camelCase names.
export { PipelineStage } from '@prisma/client';
