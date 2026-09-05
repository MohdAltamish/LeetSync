# Privacy Policy for LeetSync

**Last updated:** September 6, 2026

LeetSync ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy outlines our data handling practices.

---

### 1. Data Collection & Processing
- **No External Servers:** LeetSync does not operate any centralized servers or databases. All code operates entirely locally within your browser client.
- **No Personal Data Collected:** We do not collect, store, sell, or transmit any personally identifiable information (PII), email addresses, IP addresses, or browsing history.
- **Problem & Solution Data:** When you submit code on LeetCode and receive an "Accepted" verdict, LeetSync fetches the problem title, description, and your code submission directly from LeetCode's public endpoints to generate a commit for your GitHub repository. This data is transmitted directly to GitHub's official REST API (`api.github.com`).

---

### 2. Authentication & Credentials
- **Granular Permissions:** LeetSync connects to GitHub via GitHub App Device Flow or Fine-Grained Personal Access Tokens.
- **Per-Repository Access:** The extension only accesses the specific repository you explicitly select during setup (e.g., `LeetCode-DSA`). It has no access to any other repositories on your account.
- **Local Storage:** Access tokens are stored exclusively in your browser's encrypted local storage (`chrome.storage.local`). Tokens are never sent to any third party.

---

### 3. Third-Party Services
LeetSync interacts solely with the following two official services:
1. **GitHub API (`api.github.com`):** To authenticate and commit your solutions to your repository.
2. **LeetCode (`leetcode.com` / `leetcode.cn`):** To retrieve problem metadata and submission status.

No analytics tools, tracking cookies, advertising scripts, or third-party telemetry services are embedded in LeetSync.

---

### 4. Contact & Inquiries
If you have any questions or feedback regarding this Privacy Policy, please open an issue on GitHub:  
[https://github.com/MohdAltamish/LeetSync/issues](https://github.com/MohdAltamish/LeetSync/issues)
