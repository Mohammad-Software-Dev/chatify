export const validate =
  (schema) =>
  (req, res, next) => {
    try {
      schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      next();
    } catch (error) {
      const issues = error?.issues?.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      res.status(400).json({
        message: "Validation failed",
        errors: issues || [],
      });
    }
  };
