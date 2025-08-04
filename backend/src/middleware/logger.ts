import { Request, Response, NextFunction } from 'express';

export const logger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, url } = req;
    const { statusCode } = res;
    
    const logMessage = `${new Date().toISOString()} - ${method} ${url} - ${statusCode} - ${duration}ms`;
    
    if (statusCode >= 400) {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }
  });
  
  next();
};