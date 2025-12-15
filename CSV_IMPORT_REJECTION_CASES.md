# CSV/Bulk Import - Cases Where Products Are Rejected

This document lists all scenarios where products from CSV files will **NOT** be imported.

## 📋 Table of Contents
1. [CSV Parsing Failures](#csv-parsing-failures)
2. [Silent Rejections (No Error Messages)](#silent-rejections-no-error-messages) ⚠️
3. [Validation Failures](#validation-failures)
4. [Database Import Failures](#database-import-failures)
5. [Common Issues & Solutions](#common-issues--solutions)

---

## 🔴 CSV Parsing Failures

Products are rejected **before validation** if the CSV file itself has issues:

### 1. **Malformed CSV Structure**
- Missing or incorrect headers
- Inconsistent column counts across rows
- Unclosed quotes in CSV cells
- **Result**: Entire CSV fails to parse, no products imported

### 2. **Empty Rows**
- Rows with only whitespace
- Completely empty rows
- **Result**: These rows are automatically skipped (by design)

### 3. **File Encoding Issues**
- Non-UTF-8 encoding
- Special characters corrupted
- **Result**: Parsing errors, products may be skipped

---

## ⚠️ Validation Failures

Products that fail validation are **rejected** and shown in the error management UI:

### 1. **Product Name Issues**

#### ❌ **Empty or Missing Name**
- Empty string: `""`
- Only whitespace: `"   "`
- Missing `name` column
- **Error**: "Product name is required"

#### ❌ **Name Too Long**
- More than 100 characters
- **Error**: "Product name must be less than 100 characters"

#### ❌ **Invalid Characters in Name**
- Contains control characters (null bytes, line breaks, etc.)
- Contains script injection: `<script` or `javascript:`
- **Error**: "Product name contains invalid characters"
- **Note**: Most special characters are now allowed (Unicode, accents, etc.)

### 2. **Price Issues**

#### ❌ **Invalid Price Format**
- Not a number: `"abc"`, `"N/A"`, `"free"`
- Empty price field
- **Error**: "Price must be a number between 0 and 999,999.99"

#### ❌ **Price Out of Range**
- Negative numbers: `"-10"`
- Too large: `"1000000"` (over 999,999.99)
- **Error**: "Price must be a number between 0 and 999,999.99"

#### ✅ **Valid Price Formats** (These work):
- `"29.99"`
- `"$29.99"` (dollar sign is removed)
- `"1,999.99"` (commas are removed)
- `"0"` or `"0.00"` (free products)

### 3. **Category ID Issues**

#### ❌ **Invalid UUID Format**
- Not a valid UUID: `"category-1"`, `"123"`, `"abc"`
- Wrong format: `"550e8400-e29b-41d4-a716"` (missing parts)
- Empty categoryId
- **Error**: "Category ID must be a valid UUID format"

#### ❌ **Category Doesn't Exist in Database**
- Valid UUID format but category doesn't exist in your store
- Category belongs to a different store
- **Error**: Product fails during import (logged in server)

#### ✅ **Valid Category ID Format**:
- `"550e8400-e29b-41d4-a716-446655440000"` (standard UUID v4)

### 4. **Description Issues**

#### ❌ **Description Too Long**
- More than 1000 characters
- **Error**: "Description must be less than 1000 characters"

#### ✅ **Valid Description**:
- Empty/blank (optional)
- Up to 1000 characters
- Can contain any characters

### 5. **Video URL Issues**

#### ❌ **Invalid Video URL Format**
- Not a valid URL: `"video.mp4"`, `"not-a-url"`
- Wrong file extension: `"https://example.com/video.avi"`
- Missing protocol: `"example.com/video.mp4"`
- **Error**: "Video URL must be a valid .mp4 or .mov URL"

#### ✅ **Valid Video URL Formats**:
- Empty/blank (optional)
- `"https://example.com/video.mp4"`
- `"http://example.com/video.mov"`
- Case insensitive: `.MP4`, `.MOV` work too

### 6. **Download URL Issues**

#### ⚠️ **Note**: Download URL is optional and has no strict validation
- Can be empty
- Can be any string format
- No validation errors for downloadUrl

### 7. **Image URL Issues**

#### ⚠️ **Note**: Image URL is optional
- Can be empty
- Can be comma-separated: `"url1.jpg,url2.jpg,url3.jpg"`
- Invalid URLs won't cause validation failure, but images won't display

### 8. **Boolean Field Issues**

#### ⚠️ **Note**: `isFeatured` and `isArchived` are optional
- Default to `false` if not provided
- **Valid values**: `"true"`, `"1"`, `"yes"` (case insensitive)
- **Invalid values**: Treated as `false` (no error)

### 9. **Keywords Issues**

#### ⚠️ **Note**: Keywords are optional
- Can be empty
- Can be comma-separated: `"keyword1,keyword2,keyword3"`
- No validation errors for keywords

---

## 🗄️ Database Import Failures

Even if validation passes, products can fail during database import:

### 1. **Unique Constraint Violations**
- **Case**: Product with same name already exists in the same store
- **Behavior**: Product is **updated** instead of creating a duplicate
- **Note**: This is handled gracefully, not a failure

### 2. **Database Connection Issues**
- Database unavailable
- Connection timeout
- **Result**: Import fails, error logged

### 3. **Foreign Key Constraint Violations**
- Category ID doesn't exist in database
- Store ID doesn't exist
- **Result**: Product fails to import, error logged

### 4. **Transaction Failures**
- Database transaction rollback
- Constraint violations
- **Result**: Chunk of products fails, others may succeed

---

## 🔧 Common Issues & Solutions

### Issue: "Many products rejected due to name validation"
**Solution**: The name validation was recently made more permissive. If you still see rejections:
- Check for control characters (copy-paste from Word/Excel can add these)
- Remove any `<script` or `javascript:` text
- Ensure name is not empty or only whitespace

### Issue: "Category ID validation errors"
**Solution**:
1. Verify category IDs exist in your database
2. Ensure category IDs are valid UUIDs (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
3. Check that categories belong to the correct store

### Issue: "Price validation errors"
**Solution**:
- Remove currency symbols (they're auto-removed, but some formats may fail)
- Ensure price is a number between 0 and 999,999.99
- Use `.` for decimal separator, not `,`

### Issue: "Products pass validation but don't appear in database"
**Possible Causes**:
1. Inngest function failed silently (check server logs)
2. Database connection issues
3. Products were updated instead of created (check for existing products with same name)

### Issue: "CSV file won't parse"
**Solution**:
1. Ensure CSV is UTF-8 encoded
2. Check for unclosed quotes in cells
3. Verify all rows have the same number of columns
4. Check that headers match expected format

---

## 📊 Validation Summary

When you import a CSV, you'll see a summary like:
```
Found X validation errors in Y products. Z products passed validation.
```

This tells you:
- **X**: Total number of validation errors (one product can have multiple errors)
- **Y**: Number of products that failed validation
- **Z**: Number of products that passed validation and will be imported

---

## ✅ Best Practices

1. **Validate Category IDs First**: Ensure all categoryId values in your CSV exist in your database
2. **Check Price Format**: Use numbers only, or format like `"29.99"` or `"$29.99"`
3. **Name Length**: Keep product names under 100 characters
4. **Test with Small CSV**: Import 5-10 products first to verify format
5. **Check Error Management UI**: Review rejected products and fix them before re-importing

---

## 🔍 How to Check What Failed

1. **During Import**: Check the toast notification for summary
2. **Error Management UI**: If validation errors exist, an error management panel appears
3. **Browser Console**: Check for `⚠️ VALIDATION SUMMARY` messages
4. **Server Logs**: Check terminal for detailed import logs
5. **Inngest Dashboard**: Visit `http://localhost:8288` to see function execution details

---

## 📝 Example of Valid CSV Row

```csv
name,description,price,categoryId,downloadUrl,imageUrl,isFeatured,isArchived,keywords,videoUrl
Premium Logo Pack,High-quality logo designs,29.99,550e8400-e29b-41d4-a716-446655440000,https://example.com/download.zip,https://example.com/img1.jpg,https://example.com/img2.jpg,true,false,logo,design,branding,https://example.com/video.mp4
```

**All fields explained**:
- `name`: Required, max 100 chars, no control chars
- `description`: Optional, max 1000 chars
- `price`: Required, 0-999999.99, can include $ or commas
- `categoryId`: Required, valid UUID that exists in database
- `downloadUrl`: Optional, any string
- `imageUrl`: Optional, comma-separated URLs
- `isFeatured`: Optional, "true"/"1"/"yes" or blank
- `isArchived`: Optional, "true"/"1"/"yes" or blank
- `keywords`: Optional, comma-separated
- `videoUrl`: Optional, must be .mp4 or .mov URL if provided

