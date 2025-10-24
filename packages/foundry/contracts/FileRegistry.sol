// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title FileRegistry
 * @notice Minimal registry for client-side encrypted files stored on IPFS.
 *         Stores IPFS CIDs and encrypted AES keys for the owner and approved grantees.
 *
 * Design notes:
 *  - `encKeyOwner` and `encKeyForUser` values are opaque strings produced on the client
 *    using MetaMask's x25519 encryption format (hex-encoded JSON acceptable).
 *  - `pendingRequests` stores the requester's MetaMask encryption public key as a string.
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

    // fileId => user => encrypted AES key for that user
    mapping(uint256 => mapping(address => string)) public encKeyForUser;

    // Optional helper for UI: list grantees per file
    mapping(uint256 => address[]) public grantees;

    // Owner to list of owned fileIds
    mapping(address => uint256[]) public ownerFileIds;

    // fileId => requester => requester MetaMask encryption public key (string)
    mapping(uint256 => mapping(address => string)) public pendingRequests;

    event FileUploaded(
        uint256 indexed fileId,
        address indexed owner,
        string cid,
        string encKeyOwner
    );
    event AccessRequested(
        uint256 indexed fileId,
        address indexed requester,
        string requesterEncPubKey
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
        ownerFileIds[msg.sender].push(fileId);

        emit FileUploaded(fileId, msg.sender, cid, encKeyOwner);
    }

    /**
     * @notice Request access to a file by submitting your MetaMask encryption public key.
     * @param fileId Target file id
     * @param requesterEncPubKey The requester's MetaMask encryption public key (string)
     */
    function requestAccess(
        uint256 fileId,
        string calldata requesterEncPubKey
    ) external {
        FileRecord memory rec = files[fileId];
        require(rec.owner != address(0), "Invalid file");
        require(bytes(requesterEncPubKey).length != 0, "PubKey required");

        pendingRequests[fileId][msg.sender] = requesterEncPubKey;

        emit AccessRequested(fileId, msg.sender, requesterEncPubKey);
    }

    /**
     * @notice Approve access for a requester by storing the AES key encrypted to their pubkey.
     * @dev Only the file owner can approve. Optionally clears any pending request entry.
     * @param fileId Target file id
     * @param requester Address to grant access
     * @param encKeyForRequester The AES key encrypted to the requester's MetaMask encryption pubkey
     */
    function approveAccess(
        uint256 fileId,
        address requester,
        string calldata encKeyForRequester
    ) external {
        FileRecord memory rec = files[fileId];
        require(rec.owner != address(0), "Invalid file");
        require(rec.owner == msg.sender, "Only owner");
        require(requester != address(0), "Bad requester");
        require(bytes(encKeyForRequester).length != 0, "Key required");

        // Store the encrypted key for the requester
        encKeyForUser[fileId][requester] = encKeyForRequester;

        // Maintain grantee list if first time approval
        if (!_isGrantee(fileId, requester)) {
            grantees[fileId].push(requester);
        }

        // Clear pending request if present (best-effort)
        if (bytes(pendingRequests[fileId][requester]).length != 0) {
            delete pendingRequests[fileId][requester];
        }

        emit AccessApproved(fileId, msg.sender, requester, encKeyForRequester);
    }

    /**
     * @notice Get the list of file ids owned by an address.
     */
    function getOwnerFiles(
        address owner
    ) external view returns (uint256[] memory) {
        return ownerFileIds[owner];
    }

    /**
     * @notice Get all grantees for a file id. UI helper.
     */
    function getGrantees(
        uint256 fileId
    ) external view returns (address[] memory) {
        return grantees[fileId];
    }

    function _isGrantee(
        uint256 fileId,
        address user
    ) private view returns (bool) {
        address[] memory list = grantees[fileId];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == user) return true;
        }
        return false;
    }
}
