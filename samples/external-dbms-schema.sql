-- Tables and data shared by every question (MySQL)
CREATE TABLE departments (
  dept_id   INT PRIMARY KEY,
  dept_name VARCHAR(30) NOT NULL
);

CREATE TABLE employees (
  emp_id     INT PRIMARY KEY,
  name       VARCHAR(40) NOT NULL,
  dept_id    INT,
  salary     INT NOT NULL,
  manager_id INT NULL,
  join_date  DATE,
  FOREIGN KEY (dept_id) REFERENCES departments(dept_id)
);

INSERT INTO departments VALUES
  (1, 'CSE'), (2, 'ECE'), (3, 'MECH'), (4, 'CIVIL');

INSERT INTO employees VALUES
  (101, 'Arjun', 1, 72000, NULL, '2019-06-10'),
  (102, 'Ravi',  1, 58000, 101,  '2020-01-15'),
  (103, 'Sita',  2, 45000, NULL, '2018-03-01'),
  (104, 'Kiran', 1, 50000, 101,  '2021-07-19'),
  (105, 'Meena', 2, 61000, 103,  '2019-11-25'),
  (106, 'John',  3, 39000, NULL, '2022-02-14'),
  (107, 'Priya', 3, 47000, 106,  '2020-09-30');
