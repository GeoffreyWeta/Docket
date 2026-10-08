# Auctions, invitations and global vendor blacklisting

Selling auctions accept increasing bids; reverse procurement auctions accept decreasing bids. Auction organisers can work without a reporting manager. Award approval is a separate permission.

Invitation controls support staff and company contacts from CSV/Excel, all available vendors, and vendors in a category. Imports and sending run in batches with interruption feedback. Individual staff can leave Company blank. Existing email-based staff accounts link their bidder identity using their existing password; their work role is preserved. They choose bidder mode when signing in.

The Vendors page offers Blacklist with a required reason and Reinstate. Blacklisting blocks tender and auction invitations, new bids, tender recommendations and award approvals, and auction awards. Auction bids from blacklisted vendors stop ranking. Existing records remain for audit, and reinstatement restores eligibility.

Demo: open /demo, choose ENG Auction Organiser (auctionhost) to inspect or create a selling auction. Choose Tolu - Staff Bidder (staffbidder), or Coldline's company bidder account, to open ENG surplus equipment sale, accept terms and bid. The organiser cannot approve an award. The seed_sale_demo command adds this fixture without resetting existing data and refuses to run outside the demo workspace.

Validation: 137 auction checks, procurement lifecycle checks including global blacklist guards, Django system/migration checks, production frontend build, and a browser journey covering sale creation, category/all-vendor selection, staff/company file import, terms acceptance, increasing bids and phone-width overflow. Invitation mail content was verified with captured test mail; actual production mailbox delivery was not tested. Selling auctions currently use manual bidding; reverse proxy bidding is deliberately unavailable for sales.
