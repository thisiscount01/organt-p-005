import sys, os
sys.path.insert(0, "/tmp/pylibs")
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto("http://localhost:3000/", wait_until="networkidle")
    ta = page.query_selector("#intake-answer")
    print("textarea found:", ta is not None)
    ta.click()
    ta.press("j")
    print("value after pressing j on empty field:", repr(ta.input_value()))
    ta.fill("")
    ta.press("k")
    print("value after pressing k on empty field:", repr(ta.input_value()))
    ta.fill("")
    ta.press("1")
    print("value after pressing 1 on empty field:", repr(ta.input_value()))
    ta.fill("")
    ta.press("ArrowDown")
    print("value after ArrowDown on empty field:", repr(ta.input_value()))
    browser.close()
