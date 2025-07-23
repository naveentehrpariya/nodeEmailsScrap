const express = require("express");
const app = express();
const cors = require("cors");
const morgan = require("morgan");
const bodyParser = require("body-parser");
require("dotenv").config();
const globalErrorHandler = require("./middlewares/gobalErrorHandler");
const errorHandler = require("./middlewares/errorHandler");
const cookieParser = require("cookie-parser");

app.use(cookieParser());
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(morgan("dev"));
app.use(errorHandler);
app.use(globalErrorHandler);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: "2000mb" }));
app.use(express.json());

// ----------------------
// EMAIL SCRAPING SECTION
// ----------------------
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const keys = require("./dispatch.json");
const usermail = "naveendev@crossmilescarrier.com";
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
// This auth is used by the getSentEmailsWithFullContent() function for testing.
const auth = new google.auth.JWT(
  keys.client_email,
  null,
  keys.private_key,
  SCOPES,
  usermail // impersonated user for testing
);
const gmail = google.gmail({ version: "v1", auth });
// Existing testing function (can be removed if not needed)
async function getSentEmailsWithFullContent() {
  try {
    const res = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["SENT"],
      maxResults: 5,
    });

    const messages = res.data.messages || [];

    for (const msg of messages) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = detail.data.payload.headers;
      const subject = getHeader(headers, "Subject");
      const to = getHeader(headers, "To");
      const from = getHeader(headers, "From");
      const date = getHeader(headers, "Date");

      const body = extractFullHTML(detail.data.payload);
      const rawAttachments = extractAttachments(detail.data.payload);
      const attachments = [];

      for (const attachment of rawAttachments) {
        const downloaded = await downloadAttachment(msg.id, attachment);
        if (downloaded) attachments.push(downloaded);
      }

      console.log("\n📧 Email");
      console.log("Subject:", subject);
      console.log("To:", to);
      console.log("From:", from);
      console.log("Date:", date);
      console.log("\n--- Body (HTML formatted) ---\n");
      console.log(body?.slice(0, 1000)); // Preview first 1000 characters

      if (attachments.length) {
        console.log(
          "\n📎 Attachments:",
          attachments.map((a) => a.filename)
        );
      } else {
        console.log("\n📎 No attachments");
      }
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

function getHeader(headers, name) {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    ""
  );
}

function decodeBase64(data) {
  return Buffer.from(data, "base64").toString("utf-8");
}

/**
 * extractFullHTML() will try to get text/html part; if not available, it wraps the plain text in <pre>
 */
function extractFullHTML(payload) {
  if (!payload) return "";

  // Recursive function to search for parts
  const findPart = (parts) => {
    for (const part of parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64(part.body.data);
      }
      if (part.mimeType === "text/plain" && part.body?.data) {
        // fallback: wrap plain text in <pre> tags to preserve formatting
        return `<pre>${decodeBase64(part.body.data)}</pre>`;
      }
      if (part.parts) {
        const nested = findPart(part.parts);
        if (nested) return nested;
      }
    }
    return "";
  };

  if (payload.body?.data)
    return `<pre>${decodeBase64(payload.body.data)}</pre>`;
  if (payload.parts) return findPart(payload.parts);
  return "(No content found)";
}

/**
 * extractAttachments() recursively collects attachments from a payload.
 */
function extractAttachments(payload, attachments = []) {
  if (!payload) return attachments;

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.filename && part.filename.length > 0) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          body: part.body,
        });
      }
      if (part.parts) {
        extractAttachments(part, attachments);
      }
    }
  }

  return attachments;
}

/**
 * downloadAttachment() downloads an attachment and saves it to /uploads.
 * Returns an object with filename, mimeType, and localPath.
 */
async function downloadAttachment(messageId, attachment) {
  if (!attachment.body || !attachment.body.attachmentId) return null;

  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId: messageId,
    id: attachment.body.attachmentId,
  });

  const data = res.data.data;
  const buffer = Buffer.from(data, "base64");

  // Create a safe file name combining the messageId and original filename
  const safeFileName = `${messageId}_${attachment.filename}`;
  const filePath = path.join(__dirname, "uploads", safeFileName);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  console.log(`📥 Saved attachment to: ${filePath}`);

  return {
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    localPath: filePath,
  };
}

// Uncomment if you want to run this test function:
// getSentEmailsWithFullContent();

// --------------
// API ROUTES
// --------------

const { JSDOM } = require("jsdom");

function extractEmailBodyStructured(payload) {
  let html = "";
  let plain = "";

  const findPart = (parts) => {
    for (const part of parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        html = decodeBase64(part.body.data);
      }
      if (part.mimeType === "text/plain" && part.body?.data) {
        plain = decodeBase64(part.body.data);
      }
      if (part.parts) findPart(part.parts);
    }
  };

  if (payload.body?.data) {
    plain = decodeBase64(payload.body.data);
  } else if (payload.parts) {
    findPart(payload.parts);
  }

  const structured = {
    rawHtml: html || `<pre>${plain}</pre>`,
    textBlocks: [],
  };

  if (html) {
    const dom = new JSDOM(html);
    const text = dom.window.document.body.textContent || "";
    structured.textBlocks = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } else {
    structured.textBlocks = plain
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return structured;
}

app.get("/api/emails", async (req, res) => {
  const userEmail = usermail;

  const dynamicAuth = new google.auth.JWT(
    keys.client_email,
    null,
    keys.private_key,
    SCOPES,
    userEmail
  );

  const dynamicGmail = google.gmail({ version: "v1", auth: dynamicAuth });

  try {
    const response = await dynamicGmail.users.messages.list({
      userId: "me",
      labelIds: ["CHAT"],
      maxResults: 50,
    });

    const messages = response.data.messages || [];
    const threadsMap = {};
    console.log(messages);
    for (const msg of messages) {
      const detail = await dynamicGmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });
      console.log(detail.data);

      const threadId = detail.data.threadId;
      const headers = detail.data.payload.headers;
      const subject = getHeader(headers, "Subject");
      const from = getHeader(headers, "From");
      const to = getHeader(headers, "To");

      if (!threadsMap[threadId]) {
        threadsMap[threadId] = {
          subject,
          threadId,
          from,
          to,
          innermail: [],
        };
      }

      const body = extractEmailBodyStructured(detail.data.payload);
      const rawAttachments = extractAttachments(detail.data.payload);
      const attachments = [];

      for (const attachment of rawAttachments) {
        const downloaded = await downloadAttachment(msg.id, attachment);
        if (downloaded) attachments.push(downloaded);
      }

      threadsMap[threadId].innermail.push({
        date: getHeader(headers, "Date"),
        from,
        to,
        body,
        attachments,
      });
    }

    const threads = Object.values(threadsMap);

    res.json({ success: true, threads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// async function chats() {
//   const userEmail = usermail; // assumed to be set globally

//   const SCOPES = [
//     "https://www.googleapis.com/auth/chat.spaces.readonly",
//     "https://www.googleapis.com/auth/chat.messages.readonly",
//   ];

//   const auth = new google.auth.JWT(
//     keys.client_email,
//     null,
//     keys.private_key,
//     SCOPES,
//     userEmail
//   );

//   const chat = google.chat({ version: "v1", auth });

//   try {
//     const spaceList = await chat.spaces.list();
//     const spaces = spaceList.data.spaces || [];

//     const results = [];

//     for (const space of spaces) {
//       const { name: spaceId, displayName, spaceType } = space;

//       const isDM = spaceType === "DIRECT_MESSAGE";

//       const messageRes = await chat.spaces.messages.list({
//         parent: spaceId,
//         pageSize: 10,
//       });

//       const messages = (messageRes.data.messages || []).map((msg) => ({
//         id: msg.name,
//         text: msg.text || "(no text)",
//         sender: msg.sender?.displayName || msg.sender?.name || "Unknown",
//         createTime: msg.createTime,
//       }));

//       results.push({
//         spaceId,
//         displayName:
//           displayName || (isDM ? "(Direct Message)" : "(Unnamed Space)"),
//         type: isDM ? "DM" : "ROOM",
//         messageCount: messages.length,
//         messages,
//       });
//     }

//     // Log clean JSON
//     console.log(JSON.stringify(results, null, 2));
//     return results; // optional: return for further use
//   } catch (err) {
//     console.error("Error fetching chat messages:", err);
//     return { success: false, message: err.message };
//   }
// }

// chats();




















































// =======================================================
// =======================================================
// =======================================================
// =======================================================
// =======================================================
// =======================================================
// =======================================================
// =======================================================
// =======================================================
// =======================================================
// =======================================================

const DOMAIN = "crossmilescarrier.com"; // your domain for internal/external check

async function getCurrentUserId(auth, email) {
const admin = google.admin({ version: "directory_v1", auth });
try {
const res = await admin.users.get({ userKey: email });
return `users/${res.data.id}`;
} catch (e) {
console.error(`❌ Failed to resolve current user ID: ${e.message}`);
return null;
}
}

async function resolveUserId(auth, userResourceName) {
const admin = google.admin({ version: "directory_v1", auth });
try {
const userId = userResourceName.split("/")[1];
const res = await admin.users.get({ userKey: userId });
return {
email: res.data.primaryEmail,
displayName: res.data.name.fullName,
domain: res.data.primaryEmail.split("@")[1],
};
} catch (e) {
console.error(`❌ Failed to resolve user ${userResourceName}: ${e.message}`);
return {
email: userResourceName,
displayName: userResourceName,
domain: "unknown",
};
}
}

async function fetchAllChatMessages() {
const SCOPES = [
"https://www.googleapis.com/auth/chat.spaces.readonly",
"https://www.googleapis.com/auth/chat.messages.readonly",
"https://www.googleapis.com/auth/admin.directory.user.readonly",
];

const auth = new google.auth.JWT(
keys.client_email,
null,
keys.private_key,
SCOPES,
usermail
);

const chat = google.chat({ version: "v1", auth });
const currentUserId = await getCurrentUserId(auth, usermail);

try {
const spaceRes = await chat.spaces.list();
const spaces = spaceRes.data.spaces || [];
const results = [];

for (const space of spaces) {
  const spaceId = space.name;
  const spaceType = space.spaceType;
  const displayName =
    space.displayName ||
    (spaceType === "DIRECT_MESSAGE" ? "(Direct Message)" : "(Unnamed Space)");

  const messageRes = await chat.spaces.messages.list({
    parent: spaceId,
    pageSize: 50, // increase if needed
  });

  const rawMessages = messageRes.data.messages || [];
  const messages = [];

  for (const m of rawMessages) {
    const senderId = m.sender?.name || "Unknown";
    const senderInfo = await resolveUserId(auth, senderId);

    const isSentByCurrentUser = senderId === currentUserId;
    const isExternal = !senderInfo.email.endsWith(`@${DOMAIN}`);

    messages.push({
      id: m.name,
      text: m.text || "(no text)",
      senderId,
      senderEmail: senderInfo.email,
      senderDisplayName: senderInfo.displayName,
      senderDomain: senderInfo.domain,
      isSentByCurrentUser,
      isExternal,
      createTime: m.createTime,
    });
  }

  results.push({
    spaceId,
    displayName,
    spaceType,
    messageCount: messages.length,
    messages,
  });
}

fs.writeFileSync("chat_messages_enriched.json", JSON.stringify(results, null, 2));
console.log("✅ Chat messages with sender info saved to chat_messages_enriched.json");

return results;
} catch (err) {
console.error("❌ Error:", err.message);
return { success: false, message: err.message };
}
}

fetchAllChatMessages();



















































app.get("/api/gmail", async (req, res) => {
  const userEmail = usermail;

  const chatAuth = new google.auth.JWT(
    keys.client_email,
    null,
    keys.private_key,
    ["https://www.googleapis.com/auth/gmail.readonly"],
    userEmail
  );

  const gmail = google.gmail({ version: "v1", auth: chatAuth });

  try {
    const list = await gmail.users.messages.list({
      userId: "me",
      q: "label:chats",
      maxResults: 20,
    });

    const messages = [];

    for (const msg of list.data.messages || []) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const payload = detail.data.payload;
      const headers = payload.headers || [];

      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const from = headers.find((h) => h.name === "From")?.value;
      const to = headers.find((h) => h.name === "To")?.value;
      const date = headers.find((h) => h.name === "Date")?.value;
      const body = decodeBase64(payload.body?.data || "") || "(no content)";

      messages.push({ subject, from, to, date, body });
    }

    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/", (req, res) => {
  res.send({
    message: "EMAIL VERIFICATION API",
    status: 200,
  });
});

app.all("*", (req, res, next) => {
  res.status(404).json({
    status: 404,
    message: `NOT FOUND`,
  });
});

const port = process.env.PORT || "8080";
app.listen(port, () => {
  console.log(`On PORT ${port} SERVER RUNNINGGGGG.....`);
});
