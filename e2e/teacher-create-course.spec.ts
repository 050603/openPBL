import { test, expect } from "@playwright/test";

/**
 * Teacher creates a course E2E skeleton.
 *
 * Covers the happy-path: teacher signs in → opens course builder →
 * fills metadata → saves → course appears in the course list.
 *
 * Status: skeleton — implementation deferred until seed data and
 * stable course-builder selectors are in place. Skipped via
 * `test.skip` to keep CI green.
 */

test.skip("teacher can create a new course with valid metadata", async () => {
  // TODO: implement after course-builder fixtures are stable.
});

test.skip("teacher sees validation errors for missing required fields", async () => {
  // TODO: implement after course-builder fixtures are stable.
});

test.skip("newly created course appears in the course list", async () => {
  // TODO: implement after course-builder fixtures are stable.
});
