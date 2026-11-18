// Fixed choices for the team task tracker. Shared by the server (validation)
// and the screens, so it must not import anything server-only.
export const STATUSES = [
  { key: "todo", label: "To do" },
  { key: "doing", label: "In progress" },
  { key: "stuck", label: "Stuck" },
  { key: "done", label: "Done" },
];
export const PRIORITIES = [
  { key: "urgent", label: "Urgent" },
  { key: "high", label: "High" },
  { key: "normal", label: "Normal" },
  { key: "low", label: "Low" },
];
export const LABELS = ["Production", "Printing", "Paper & RM", "Dispatch", "Warehouse", "Maintenance", "Customer", "Accounts", "Other"];
export const RECURRENCES = [
  { key: "none", label: "Does not repeat" },
  { key: "daily", label: "Every day" },
  { key: "weekly", label: "Every week" },
  { key: "monthly", label: "Every month" },
];
