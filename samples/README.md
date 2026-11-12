# Sample files for manual testing

Every file imports with no warnings. Sign in at `http://localhost:5173/dev` as **Test Teacher** (`teacher@examify.test`), and as **Test Student 1–6** (`n299001`…`n299006`) in another browser profile or a private window.

| File | Exam type | What's in it |
| --- | --- | --- |
| `viva-dbms-30-questions.xlsx` | Viva | 30 DBMS questions: 12 easy, 12 medium, 6 hard (16 single-correct, 6 multiple-correct, 8 fill in the blank). |
| `internal-dbms-9-questions.xlsx` | Internal | 9 DBMS lab questions, 3 per difficulty, 10–20 marks each. |
| `external-dbms-9-questions.xlsx` | External | 9 DBMS questions, 3 per difficulty: 7 SQL, 1 PHP + MySQL, 1 Python + MySQL. Covers public and private tests, starter code, and a question with no test cases. |
| `external-dbms-schema.sql` | External | The tables and rows the DBMS questions use. Paste it into **Questions → Shared schema and data**. |
| `external-dsa-6-questions.xlsx` | External | 6 DSA questions: 4 in any language (the student picks), 1 in C, 1 in Java. |
| `external-dbms-6-sql-sets.xlsx` | External | Your own sets, as in the DBMS lab exams: 3 sets of 6 SQL queries, 5 marks each. Each set has its own database (library, company, sales), given once on the **Sets** sheet. Every query has a public test and a private one (the same tables after a few changes); the expected outputs were worked out by running the answers on the rows. |
| `students.xlsx` | Any | The six dev-login students, by email. Import it under **Students**. |

## Getting exactly 3 sets

- **Viva:** 10 questions per set, balanced 4 easy, 4 medium and 2 hard. Each set gets its own 10 questions with no repeats.
- **Internal and DBMS external:** 3 questions per set, balanced 1 easy, 1 medium and 1 hard.
- **DSA external:** with the same 1/1/1 blueprint, the 6 questions make 2 sets.
- **Six SQL queries per set:** `external-dbms-6-sql-sets.xlsx` has a set column, so it imports as your own 3 sets of 6, each with its tables (the preview says *with tables and data for 3 sets*). Students see their set's tables above every query, and each query has its own editor and Run.

## A quick test run

1. **Viva.**
   - Create the viva, import the 30 questions, set the blueprint, import `students.xlsx`, then go live.
   - As a student, answer a few questions and switch tabs. The paper locks.
   - In **Live**, hover the status badge to see what *Locked* means, then unlock the student from the row menu.
   - Submit, and check the score on both sides.
2. **Internal.**
   - Create the internal and import its sheet.
   - The student sees the question paper and can leave the tab or copy freely (both are off by default).
   - **Close the paper** records the finish. **Results** is an attendance sheet.
3. **External.**
   - Create the external, import the DBMS sheet and paste the schema.
   - Open a question and press **Check my answer with AI**. Your own answer should score close to 100%.
   - As a student, press **Run** on a question (Ctrl+Enter also works). The public test results show first, then the private ones. Any private test the code fails is shown with its input and expected output, followed by a correctness %.
   - Change the code: the result is marked as out of date.
   - Submit without running one question. Its code is checked in the background, and the result screen waits for it.
   - In **Results**, open the answer sheet. Try **Change marks**, **Re-check with AI** and **PDF**.
   - **Answer sheets (PDF)** in Results downloads every student's sheet in one file.

The AI checker needs `GEMINI_API_KEY` in `backend/.env`. The free tier allows only a few checks a minute; when it's busy, students see "try again in about N seconds". For a real exam with many students, use a paid key.

## Demo exams

Students can try a demo external and a demo viva from their dashboard, at `/demo/external` and `/demo/viva`. Nothing in them is saved.
