window.QS = window.QS || {};

QS.SCHEMA = {
  employees: {
    label: "employees",
    columns: [
      { name: "id", type: "int" },
      { name: "name", type: "text" },
      { name: "dept_id", type: "int" },
      { name: "salary", type: "int" },
      { name: "hired", type: "text" }
    ],
    rows: [
      { id: 1, name: "Sam Okonkwo", dept_id: 10, salary: 118000, hired: "2021-03-12" },
      { id: 2, name: "Mei Chen", dept_id: 10, salary: 142000, hired: "2019-08-01" },
      { id: 3, name: "Jordan Lee", dept_id: 20, salary: 91000, hired: "2022-01-18" },
      { id: 4, name: "Priya Shah", dept_id: 20, salary: 104000, hired: "2020-11-09" },
      { id: 5, name: "Noah Adler", dept_id: 30, salary: 76000, hired: "2023-06-22" },
      { id: 6, name: "Elena Rossi", dept_id: 30, salary: 88000, hired: "2021-09-30" },
      { id: 7, name: "Chris Patel", dept_id: 10, salary: 155000, hired: "2018-04-14" },
      { id: 8, name: "Amina Farouk", dept_id: 40, salary: 99000, hired: "2022-07-07" }
    ]
  },
  departments: {
    label: "departments",
    columns: [
      { name: "id", type: "int" },
      { name: "name", type: "text" },
      { name: "floor", type: "int" }
    ],
    rows: [
      { id: 10, name: "Payments", floor: 4 },
      { id: 20, name: "Auth", floor: 3 },
      { id: 30, name: "Support", floor: 2 },
      { id: 40, name: "Data", floor: 5 }
    ]
  },
  orders: {
    label: "orders",
    columns: [
      { name: "id", type: "int" },
      { name: "emp_id", type: "int" },
      { name: "sku", type: "text" },
      { name: "qty", type: "int" },
      { name: "total", type: "int" }
    ],
    rows: [
      { id: 501, emp_id: 1, sku: "LEDGER-A", qty: 2, total: 240 },
      { id: 502, emp_id: 2, sku: "LEDGER-B", qty: 1, total: 180 },
      { id: 503, emp_id: 3, sku: "LEDGER-A", qty: 4, total: 480 },
      { id: 504, emp_id: 4, sku: "INK-RED", qty: 12, total: 96 },
      { id: 505, emp_id: 7, sku: "LEDGER-B", qty: 3, total: 540 },
      { id: 506, emp_id: 8, sku: "INK-RED", qty: 6, total: 48 }
    ]
  },
  products: {
    label: "products",
    columns: [
      { name: "sku", type: "text" },
      { name: "title", type: "text" },
      { name: "price", type: "int" }
    ],
    rows: [
      { sku: "LEDGER-A", title: "Harbor daybook", price: 120 },
      { sku: "LEDGER-B", title: "Quarter close binder", price: 180 },
      { sku: "INK-RED", title: "Rust ink cartridge", price: 8 }
    ]
  }
};

QS.FK = [
  { from: "employees", col: "dept_id", to: "departments", toCol: "id" },
  { from: "orders", col: "emp_id", to: "employees", toCol: "id" },
  { from: "orders", col: "sku", to: "products", toCol: "sku" }
];

QS.tableByName = function (name) {
  var key = String(name || "").toLowerCase();
  return QS.SCHEMA[key] || null;
};

QS.SEED_SQL =
  "SELECT e.name AS employee, d.name AS department, e.salary\n" +
  "FROM employees AS e\n" +
  "INNER JOIN departments AS d ON e.dept_id = d.id\n" +
  "WHERE e.salary >= 80000\n" +
  "ORDER BY e.salary DESC\n" +
  "LIMIT 10";

QS.PRESETS = [
  { id: "join-depts", name: "Employees × departments", sql: QS.SEED_SQL },
  {
    id: "all-emp",
    name: "All employees",
    sql: "SELECT id, name, salary, hired\nFROM employees\nORDER BY id ASC"
  },
  {
    id: "high-salary",
    name: "Salary ≥ 100000",
    sql: "SELECT name, salary\nFROM employees\nWHERE salary >= 100000\nORDER BY salary DESC"
  },
  {
    id: "orders-join",
    name: "Orders × products",
    sql:
      "SELECT o.id AS order_id, p.title, o.qty, o.total\n" +
      "FROM orders AS o\n" +
      "INNER JOIN products AS p ON o.sku = p.sku\n" +
      "WHERE o.total >= 100\n" +
      "ORDER BY o.total DESC"
  },
  {
    id: "dept-agg",
    name: "Headcount by department",
    sql:
      "SELECT d.name AS department, COUNT(*) AS n, AVG(e.salary) AS avg_salary\n" +
      "FROM employees AS e\n" +
      "INNER JOIN departments AS d ON e.dept_id = d.id\n" +
      "GROUP BY d.name\n" +
      "HAVING COUNT(*) >= 2\n" +
      "ORDER BY n DESC"
  }
];
