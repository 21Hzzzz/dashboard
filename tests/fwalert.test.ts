import { expect, test } from "bun:test"

import { validateFwAlertUrl } from "../app/lib/fwalert.server"

test("only accepts secure FwAlert telephone links", () => {
  expect(validateFwAlertUrl("https://fwalert.com/telephone-link")).toBe(
    "https://fwalert.com/telephone-link"
  )
  expect(() => validateFwAlertUrl("http://fwalert.com/telephone-link")).toThrow()
  expect(() => validateFwAlertUrl("https://example.com/telephone-link")).toThrow()
})
