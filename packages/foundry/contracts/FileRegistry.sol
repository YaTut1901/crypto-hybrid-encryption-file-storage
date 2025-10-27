// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title FileRegistry
 * @notice Minimal registry for client-side encrypted files stored on IPFS.
 *         Stores IPFS CIDs and encrypted AES keys for the owner and approved grantees.
 *
 * Design notes:
 *  - `encKeyOwner` value is an opaque string produced on the client using Lit Protocol encryption format.
 *  - `pendingRequests` stores the requester's address.
 */
contract FileRegistry {
    struct FileRecord {
        address owner;
        string cid; // IPFS CID for the encrypted file
        string fileType; // file type
        string encKeyOwner; // encrypted AES key for the owner (MetaMask format)
    }

    // Auto-incrementing file id counter
    uint256 private nextFileId;

    // fileId => record
    mapping(uint256 => FileRecord) public files;

    // fileId => encrypted AES key for the user
    mapping(uint256 => mapping(address => string)) public encKeyForRequester;

    // fileId => requester
    mapping(uint256 => mapping(address => bool)) public pendingRequests;

    event FileUploaded(
        uint256 indexed fileId,
        address indexed owner,
        string cid,
        string encKeyOwner
    );
    event AccessRequested(
        uint256 indexed fileId,
        address indexed requester
    );
    event AccessApproved(
        uint256 indexed fileId,
        address indexed owner,
        address indexed grantee,
        string encKeyForRequester
    );

    /**
     * @notice Upload a file record to the registry.
     * @param cid IPFS CID of the encrypted file
     * @param encKeyOwner Encrypted AES file key for the owner (MetaMask-compatible string)
     * @return fileId Newly assigned file id
     */
    function uploadFile(
        string calldata cid,
        string calldata fileType,
        string calldata encKeyOwner
    ) external returns (uint256 fileId) {
        require(bytes(cid).length != 0, "CID required");
        require(bytes(encKeyOwner).length != 0, "Owner key required");

        unchecked {
            fileId = ++nextFileId;
        }

        files[fileId] = FileRecord({
            owner: msg.sender,
            cid: cid,
            fileType: fileType,
            encKeyOwner: encKeyOwner
        });

        emit FileUploaded(fileId, msg.sender, cid, encKeyOwner);
    }

    /**
     * @notice Request access to a file.
     * @param fileId Target file id
     */
    function requestAccess(
        uint256 fileId
    ) external {
        FileRecord memory rec = files[fileId];
        require(rec.owner != address(0), "Invalid file");

        if (pendingRequests[fileId][msg.sender]) {
            revert("Request already pending");
        }

        pendingRequests[fileId][msg.sender] = true;

        emit AccessRequested(fileId, msg.sender);
    }

    /**
     * @notice Approve access for a requester.
     * @dev Only the file owner can approve. Optionally clears any pending request entry.
     * @param fileId Target file id
     * @param requester Address to grant access
     */
    function approveAccess(
        uint256 fileId,
        address requester,
        string calldata _encKeyForRequester
    ) external {
        FileRecord memory rec = files[fileId];
        require(rec.owner != address(0), "Invalid file");
        require(rec.owner == msg.sender, "Only owner");
        require(requester != address(0), "Bad requester");

        pendingRequests[fileId][requester] = false;

        encKeyForRequester[fileId][requester] = _encKeyForRequester;

        emit AccessApproved(fileId, msg.sender, requester, _encKeyForRequester);
    }
}
