# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workflow.spec.ts >> I. End-to-End Workflow Verification >> Complete flow: Landing, Auth, Onboarding, Dashboard, Workspace 7 Steps, Autosave, Command Palette, Sign Out
- Location: tests\e2e\workflow.spec.ts:163:3

# Error details

```
Test timeout of 90000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - link "Sift home" [ref=e7] [cursor=pointer]:
          - /url: /
          - generic [ref=e8]: Sift
        - generic [ref=e9]:
          - button "Download hiring pack" [ref=e10]
          - button "QR" [ref=e15]
    - generic [ref=e19]:
      - complementary [ref=e20]:
        - navigation "Workflow" [ref=e21]:
          - list [ref=e22]:
            - listitem [ref=e23]:
              - button "Signed in" [disabled] [ref=e24]
            - listitem [ref=e30]:
              - button "Job description" [ref=e31]
            - listitem [ref=e37]:
              - button "Upload CVs" [ref=e38]
            - listitem [ref=e45]:
              - button "Stack ranking" [ref=e46]
            - listitem [ref=e53]:
              - button "Screening questions" [ref=e54]
            - listitem [ref=e61]:
              - button "Hiring market" [ref=e62]
            - listitem [ref=e69]:
              - button "Search strings" [ref=e70]
      - main [ref=e77]:
        - generic [ref=e79]:
          - generic [ref=e80]:
            - generic [ref=e81]:
              - paragraph [ref=e82]: Step 3 of 7
              - heading "Upload CVs" [level=1] [ref=e84]
              - paragraph [ref=e85]: Drop every CV at once. Files are parsed in parallel by 4 background Web Workers, and personal details are stripped before anything is sent to the AI.
            - button "Clear all" [ref=e87]
          - button [ref=e91] [cursor=pointer]:
            - button "Choose File" [ref=e92]
            - paragraph [ref=e112]: Drop CVs here
            - paragraph [ref=e113]: PDF and Word (.docx). Select as many as you like.
          - generic [ref=e114]:
            - generic [ref=e116]:
              - paragraph [ref=e117]: CVs read
              - paragraph [ref=e118]:
                - generic [ref=e119]: "7"
                - generic [ref=e120]: of 7
              - paragraph [ref=e121]: 4 PDF and 3 Word
            - generic [ref=e123]:
              - paragraph [ref=e124]: Details hidden
              - generic [ref=e128]: "21"
              - paragraph [ref=e129]: name, gender, age, contact…
            - generic [ref=e131]:
              - paragraph [ref=e132]: Last batch
              - paragraph [ref=e135]: 1.05s
              - paragraph [ref=e136]: 7 files, 4 threads
          - generic [ref=e138]:
            - generic [ref=e139]: Worker pool
            - generic [ref=e143]:
              - generic [ref=e144]:
                - paragraph [ref=e145]: thread 1
                - paragraph [ref=e146]:
                  - generic [ref=e147]: idle · 2 done
              - generic [ref=e148]:
                - paragraph [ref=e149]: thread 2
                - paragraph [ref=e150]:
                  - generic [ref=e151]: idle · 2 done
              - generic [ref=e152]:
                - paragraph [ref=e153]: thread 3
                - paragraph [ref=e154]:
                  - generic [ref=e155]: idle · 1 done
              - generic [ref=e156]:
                - paragraph [ref=e157]: thread 4
                - paragraph [ref=e158]:
                  - generic [ref=e159]: idle · 2 done
          - list [ref=e160]:
            - listitem [ref=e161]:
              - generic [ref=e162]:
                - generic [ref=e167]:
                  - paragraph [ref=e168]: Ananya Rao
                  - paragraph [ref=e169]: 01_Ananya_Rao.pdf · 2 KB · 151 words · 391 ms
                - generic [ref=e170]: 2 hidden
                - button "Preview what the AI sees" [ref=e175]
                - button "Remove 01_Ananya_Rao.pdf" [ref=e179]
            - listitem [ref=e183]:
              - generic [ref=e184]:
                - generic [ref=e190]:
                  - paragraph [ref=e191]: Rahul Verma
                  - paragraph [ref=e192]: 02_Rahul_Verma.docx · 36 KB · 106 words · 416 ms
                - generic [ref=e193]: 2 hidden
                - button "Preview what the AI sees" [ref=e198]
                - button "Remove 02_Rahul_Verma.docx" [ref=e202]
            - listitem [ref=e206]:
              - generic [ref=e207]:
                - generic [ref=e212]:
                  - paragraph [ref=e213]: Priya Nair
                  - paragraph [ref=e214]: 03_Priya_Nair.pdf · 2 KB · 81 words · 463 ms
                - generic [ref=e215]: 2 hidden
                - button "Preview what the AI sees" [ref=e220]
                - button "Remove 03_Priya_Nair.pdf" [ref=e224]
            - listitem [ref=e228]:
              - generic [ref=e229]:
                - generic [ref=e235]:
                  - paragraph [ref=e236]: Karthik Subramanian
                  - paragraph [ref=e237]: 04_Karthik_Subramanian.docx · 36 KB · 89 words · 413 ms
                - generic [ref=e238]: 2 hidden
                - button "Preview what the AI sees" [ref=e243]
                - button "Remove 04_Karthik_Subramanian.docx" [ref=e247]
            - listitem [ref=e251]:
              - generic [ref=e252]:
                - generic [ref=e257]:
                  - paragraph [ref=e258]: Meera Iyer
                  - paragraph [ref=e259]: 05_Meera_Iyer.pdf · 2 KB · 83 words · 7 ms
                - generic [ref=e260]: 2 hidden
                - button "Preview what the AI sees" [ref=e265]
                - button "Remove 05_Meera_Iyer.pdf" [ref=e269]
            - listitem [ref=e273]:
              - generic [ref=e274]:
                - generic [ref=e280]:
                  - paragraph [ref=e281]: Arjun Mehta
                  - paragraph [ref=e282]: 06_Arjun_Mehta.docx · 36 KB · 117 words · 138 ms
                - generic [ref=e283]: 9 hidden
                - button "Preview what the AI sees" [ref=e288]
                - button "Remove 06_Arjun_Mehta.docx" [ref=e292]
            - listitem [ref=e296]:
              - generic [ref=e297]:
                - generic [ref=e302]:
                  - paragraph [ref=e303]: Sneha Kulkarni
                  - paragraph [ref=e304]: 07_Sneha_Kulkarni.pdf · 2 KB · 92 words · 270 ms
                - generic [ref=e305]: 2 hidden
                - button "Preview what the AI sees" [ref=e310]
                - button "Remove 07_Sneha_Kulkarni.pdf" [ref=e314]
          - button "Rank 7 candidates" [ref=e319]
  - region "Notifications alt+T"
```