/**
 * MongoDB ObjectId validation utilities
 */

/**
 * Validates if a string is a valid MongoDB ObjectId format (24-character hex string)
 * @param id - The string to validate
 * @returns true if valid ObjectId format, false otherwise
 */
export function isValidObjectId(id: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(id);
}

/**
 * Validates an ObjectId and throws an error with helpful message if invalid
 * @param id - The ObjectId string to validate
 * @param fieldName - Name of the field being validated (e.g., "projectId", "userId")
 * @throws Error with descriptive message if invalid
 */
export function validateObjectId(id: string, fieldName: string = 'id'): void {
  if (!isValidObjectId(id)) {
    throw new Error(
      `Invalid ${fieldName} format. Expected MongoDB ObjectId (24 hex characters). ` +
      `Received: ${id} (${id.length} characters). ` +
      `Note: This system uses MongoDB ObjectIds, not PostgreSQL UUIDs.`
    );
  }
}

/**
 * Express middleware factory for ObjectId validation
 * @param paramName - The query parameter name to validate
 * @param required - Whether the parameter is required (default: true)
 * @returns Express middleware function
 */
export function validateObjectIdParam(paramName: string, required: boolean = true) {
  return (req: any, res: any, next: any) => {
    const value = req.query[paramName] || req.params[paramName];
    
    if (!value) {
      if (required) {
        return res.status(400).json({
          error: `${paramName} is required`,
          code: 'MISSING_PARAMETER'
        });
      }
      return next();
    }

    if (!isValidObjectId(value as string)) {
      return res.status(400).json({
        error: `Invalid ${paramName} format. Expected MongoDB ObjectId (24 hex characters).`,
        code: 'INVALID_OBJECTID_FORMAT',
        received: value,
        note: 'This system uses MongoDB ObjectIds, not PostgreSQL UUIDs.'
      });
    }

    next();
  };
}