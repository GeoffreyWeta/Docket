# Vendor reference data

`manage.py update_vendor_data --file /private/path/vendors_import.csv` previews an additive CSV import. Add `--commit` to apply it atomically. The CSV itself belongs outside version control.

The command uses exact company names (ignoring case and whitespace), or a vendor code that is unique in both the file and database, to preserve existing identities. Repeated company names share a record; repeated codes alone do not merge different companies. Original source IDs and vendor type are retained in registry metadata. Raw categories remain in classification, while category/subcategory use the existing app taxonomy.

Contact details, address and payment terms are reference data. Missing cells do not erase existing details. Verification, blacklisting, documents, delivery performance, accounts, bids, auctions and finance history are preserved. Vendors absent from the file remain. Imports send no invitations and create no bidder accounts. New vendors start unverified.

The supplied October 8, 2026 file has 1,429 rows representing 1,421 distinct company names. Eight repeated-name rows are consolidated. Dry runs against both deployed databases found 1,421 new vendors and no existing matches. Local tests cover dry runs, repeat imports, stable code identity, workflow-state preservation, absent-vendor retention and rejection of invalid data without partial writes.
