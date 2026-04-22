import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import {
  createCosUploadTicket,
  inferStorageProvider,
  isAllowedUploadMimeType,
  persistInlineMediaIfNeeded,
} from "./file-storage.js";

test("persistInlineMediaIfNeeded uploads inline media to cos when configured", async () => {
  const uploaded = [];
  const result = await persistInlineMediaIfNeeded(
    {
      type: "image",
      role: "cover",
      publicUrl: "data:image/jpeg;base64,AA==",
    },
    {
      ownerId: 7,
      prefix: "post",
      env: {
        COS_SECRET_ID: "id",
        COS_SECRET_KEY: "key",
        COS_BUCKET: "bucket-123",
        COS_REGION: "ap-shanghai",
        COS_PUBLIC_BASE_URL: "https://cdn.example.com",
      },
      uploadBuffer: async ({ buffer, objectKey, mimeType }) => {
        uploaded.push({
          size: buffer.length,
          objectKey,
          mimeType,
        });
        return {
          objectKey,
          publicUrl: `https://cdn.example.com/${objectKey}`,
          storageProvider: "cos",
        };
      },
    }
  );

  assert.equal(result.storageProvider, "cos");
  assert.equal(result.mimeType, "image/jpeg");
  assert.match(result.publicUrl, /^https:\/\/cdn\.example\.com\/uploads\/\d{4}\/\d{2}\/post_7_/);
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].mimeType, "image/jpeg");
  assert.match(uploaded[0].objectKey, /^uploads\/\d{4}\/\d{2}\/post_7_/);
});

test("persistInlineMediaIfNeeded falls back to local uploads when cos is unavailable", async () => {
  const result = await persistInlineMediaIfNeeded(
    {
      type: "image",
      role: "cover",
      publicUrl: "data:image/jpeg;base64,AA==",
    },
    {
      ownerId: 9,
      prefix: "post",
      env: {},
    }
  );

  assert.equal(result.storageProvider, "external");
  assert.equal(result.mimeType, "image/jpeg");
  assert.match(result.publicUrl, /^\/uploads\/\d{4}\/\d{2}\/post_9_/);

  await rm(path.join(process.cwd(), result.objectKey), { force: true });
});

test("inferStorageProvider distinguishes cos urls from non-cos urls", () => {
  const env = {
    COS_PUBLIC_BASE_URL: "https://cdn.example.com",
    COS_BUCKET: "bucket-123",
    COS_REGION: "ap-shanghai",
  };

  assert.equal(
    inferStorageProvider(
      { publicUrl: "https://cdn.example.com/uploads/barter-posts/example.jpg" },
      env
    ),
    "cos"
  );
  assert.equal(
    inferStorageProvider(
      { publicUrl: "/uploads/2026/04/example.jpg" },
      env
    ),
    "external"
  );
});

test("createCosUploadTicket returns signed url + public url for allowed mime", async () => {
  const fakeClient = {
    getObjectUrl: (params, cb) => {
      assert.equal(params.Method, "PUT");
      assert.equal(params.Sign, true);
      assert.equal(params.Bucket, "bucket-123");
      assert.equal(params.Region, "ap-shanghai");
      assert.match(params.Key, /^uploads\/\d{4}\/\d{2}\/upload_7_/);
      cb(null, { Url: `https://cos.signed/${params.Key}?sig=xxx` });
    },
  };

  const ticket = await createCosUploadTicket(
    {
      ownerId: 7,
      mimeType: "image/jpeg",
      prefix: "upload",
      env: {
        COS_SECRET_ID: "id",
        COS_SECRET_KEY: "key",
        COS_BUCKET: "bucket-123",
        COS_REGION: "ap-shanghai",
        COS_PUBLIC_BASE_URL: "https://cdn.example.com",
      },
    },
    fakeClient
  );

  assert.equal(ticket.storageProvider, "cos");
  assert.equal(ticket.mimeType, "image/jpeg");
  assert.match(ticket.objectKey, /^uploads\/\d{4}\/\d{2}\/upload_7_/);
  assert.match(ticket.uploadUrl, /^https:\/\/cos\.signed\/.+sig=xxx$/);
  assert.match(ticket.publicUrl, /^https:\/\/cdn\.example\.com\/uploads\//);
  assert.ok(ticket.expiresIn >= 60);
});

test("createCosUploadTicket rejects disallowed mime types", async () => {
  const env = {
    COS_SECRET_ID: "id",
    COS_SECRET_KEY: "key",
    COS_BUCKET: "bucket-123",
    COS_REGION: "ap-shanghai",
  };
  await assert.rejects(
    () =>
      createCosUploadTicket(
        { ownerId: 1, mimeType: "application/x-msdownload", env },
        { getObjectUrl: () => assert.fail("should not call COS") }
      ),
    /mimeType not allowed/
  );
});

test("createCosUploadTicket fails when COS is not configured", async () => {
  await assert.rejects(
    () =>
      createCosUploadTicket(
        { ownerId: 1, mimeType: "image/jpeg", env: {} },
        null
      ),
    /COS is not configured/
  );
});

test("isAllowedUploadMimeType whitelists image/audio/video only", () => {
  assert.equal(isAllowedUploadMimeType("image/jpeg"), true);
  assert.equal(isAllowedUploadMimeType("audio/webm"), true);
  assert.equal(isAllowedUploadMimeType("video/mp4"), true);
  assert.equal(isAllowedUploadMimeType("application/json"), false);
  assert.equal(isAllowedUploadMimeType(""), false);
  assert.equal(isAllowedUploadMimeType(undefined), false);
});
