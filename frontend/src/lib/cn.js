// Joins class names, skipping falsy ones: cn("a", cond && "b").
export const cn = (...classes) => classes.filter(Boolean).join(" ");
