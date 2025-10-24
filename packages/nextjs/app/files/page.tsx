"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DocViewer, { DocViewerRenderers, IDocument } from "@cyntler/react-doc-viewer";
import { Abi, AbiEvent } from "abitype";
import { PublicClient } from "viem";
import { useAccount, useBlockNumber, usePublicClient } from "wagmi";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { LockClosedIcon, LockOpenIcon } from "@heroicons/react/24/solid";
import PopUp from "~~/components/popup";
import { PopUpProvider } from "~~/components/popup/PopUpContext";
import { usePopUp } from "~~/components/popup/PopUpContext";
import { Address } from "~~/components/scaffold-eth";
import { BlockieAvatar } from "~~/components/scaffold-eth/BlockieAvatar";
import { useDeployedContractInfo, useSelectedNetwork } from "~~/hooks/scaffold-eth";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { AllowedChainIds } from "~~/utils/scaffold-eth";
import { AesEncryptedFile, decryptFileWithAes, encryptFileWithAes } from "~~/utils/upload/client";
import { PinataUploadResult } from "~~/utils/upload/server";

const FileDetails: React.FC<{
  fileId: bigint;
  cid: string;
  contractAddress?: `0x${string}`;
  publicClient: PublicClient;
  abi?: Abi;
}> = ({ fileId, cid, contractAddress, publicClient, abi }) => {
  const { address: connectedAddress } = useAccount();
  const [granteeLogs, setGranteeLogs] = useState<any[]>([]);
  const [requestedLogs, setRequestedLogs] = useState<any[]>([]);
  const [fileDetails, setFileDetails] = useState<any>(null);
  const [tsByHash, setTsByHash] = useState<Record<string, number>>({});
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [docs, setDocs] = useState<IDocument[] | null>(null);
  const { writeContractAsync: writeFileRegistryAsync } = useScaffoldWriteContract({ contractName: "FileRegistry" });

  const handleRequestAccess = async (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    try {
      await writeFileRegistryAsync({
        functionName: "requestAccess",
        args: [fileId, "dummy-requester-enc-pubkey"],
      });
    } catch (err) {
      console.error("requestAccess failed", err);
    }
  };

  const handleApproveRequest = async (requester: string) => {
    try {
      await writeFileRegistryAsync({
        functionName: "approveAccess",
        args: [fileId, requester, fileDetails[3]],
      });
    } catch (err) {
      console.error("approveAccess failed", err);
    }
  };

  useEffect(() => {
    if (!contractAddress || !publicClient || !abi) return;

    const accessApprovedEvent = (abi as Abi).find(p => p.type === "event" && p.name === "AccessApproved") as
      | AbiEvent
      | undefined;

    const accessRequestedEvent = (abi as Abi).find(p => p.type === "event" && p.name === "AccessRequested") as
      | AbiEvent
      | undefined;

    publicClient
      .getLogs({
        address: contractAddress,
        event: accessApprovedEvent,
        args: { fileId },
        fromBlock: 0n,
      })
      .then(logs => {
        console.log("Access approved logs:", logs);
        setGranteeLogs(logs);

        const uniqueHashes = Array.from(new Set(logs.map((l: any) => l.blockHash as string)));
        Promise.all(uniqueHashes.map(h => publicClient.getBlock({ blockHash: h as `0x${string}` }))).then(blocks => {
          const map: Record<string, number> = {};
          uniqueHashes.forEach((h, idx) => (map[h] = Number(blocks[idx].timestamp) * 1000));
          setTsByHash(prev => ({ ...prev, ...map }));
        });

        publicClient
          .readContract({
            address: contractAddress,
            abi: abi as Abi,
            functionName: "files",
            args: [fileId],
          })
          .then((fileDetails: any) => {
            setFileDetails(fileDetails);
            const isOwner = fileDetails[0].toLowerCase() === connectedAddress?.toLowerCase();
            const isGrantee = logs.some((l: any) => l.args.grantee?.toLowerCase() === connectedAddress?.toLowerCase());
            const isAuthorized = isOwner || isGrantee;
            setAuthorized(isAuthorized);

            if (isAuthorized) {
              const gw = process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";
              fetch(`${gw}/${cid}`)
                .then(r => r.blob())
                .then(blob => {
                  const keyString = isOwner
                    ? fileDetails[3]
                    : (logs as any[]).find(
                        (l: any) => l.args.grantee?.toLowerCase() === connectedAddress?.toLowerCase(),
                      ).args.encKeyForRequester;

                  if (keyString) {
                    decryptFileWithAes(blob, keyString, fileDetails[2]).then((decryptedFile: File) => {
                      const url = URL.createObjectURL(decryptedFile);
                      setDocs([{ uri: url }]);
                    });
                  }
                })
                .catch(console.error);
            }
          });
      });

    // Also fetch AccessRequested to compute pending approvals
    publicClient
      .getLogs({
        address: contractAddress,
        event: accessRequestedEvent,
        args: { fileId },
        fromBlock: 0n,
      })
      .then(reqLogs => {
        setRequestedLogs(reqLogs as any[]);
        const uniqueHashes = Array.from(new Set((reqLogs as any[]).map((l: any) => l.blockHash as string)));
        Promise.all(uniqueHashes.map(h => publicClient.getBlock({ blockHash: h as `0x${string}` }))).then(blocks => {
          const map: Record<string, number> = {};
          uniqueHashes.forEach((h, idx) => (map[h] = Number(blocks[idx].timestamp) * 1000));
          setTsByHash(prev => ({ ...prev, ...map }));
        });
      });
  }, [fileId, contractAddress, publicClient, abi, connectedAddress]);

  return (
    <div className="bg-base-100 p-6 rounded shadow-lg w-[80vw] h-[80vh] max-w-3xl flex gap-4">
      <div className="flex-1 relative w-1/2">
        <div className="w-full h-full rounded overflow-hidden relative">
          {docs ? (
            <DocViewer
              documents={docs}
              pluginRenderers={DocViewerRenderers}
              config={{ header: { disableHeader: true } }}
              style={{ height: "100%" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm text-base-content/60">
              Loading document…
            </div>
          )}
          {!authorized && (
            <div
              onClick={handleRequestAccess}
              className="absolute inset-0 flex items-center justify-center backdrop-blur-sm bg-base-300/60 z-10 rounded cursor-pointer"
            >
              <div className="tooltip" data-tip="Request access">
                <div className="hover-animate-lock relative">
                  <LockClosedIcon className="locked h-12 w-12 text-primary-content" />
                  <LockOpenIcon className="unlocked h-12 w-12 text-primary-content absolute inset-0" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="w-1/2 pr-4 overflow-y-auto">
        <h3 className="font-bold text-lg text-center">Grantees</h3>
        {granteeLogs.length ? (
          <table className="table table-sm w-full">
            <thead>
              <tr>
                <th>Address</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {granteeLogs.map((log: any) => (
                <tr key={`${log.transactionHash}-${log.logIndex}`}>
                  <td>
                    <Address address={log.args.grantee} />
                  </td>
                  <td>{new Date(tsByHash[log.blockHash as string] || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-sm text-gray-500">No grantees yet</div>
        )}
        {/* Pending requests subsection (derived) */}
        {requestedLogs.length > 0 &&
          authorized &&
          (() => {
            const approvedSet = new Set<string>(
              (granteeLogs as any[]).map(l => (l as any).args?.grantee?.toLowerCase()).filter(Boolean) as string[],
            );
            const seen = new Set<string>();
            const pending = (requestedLogs as any[]).filter(l => {
              const r = ((l as any).args?.requester as string | undefined)?.toLowerCase();
              if (!r || approvedSet.has(r) || seen.has(r)) return false;
              seen.add(r);
              return true;
            });
            if (!pending.length) return null;
            return (
              <>
                <div className="my-3 border-t border-slate-500/60"></div>
                <h3 className="font-bold text-lg text-center">Waiting for approve</h3>
                <table className="table table-zebra table-md w-full">
                  <thead>
                    <tr>
                      <th>Address</th>
                      <th>Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((log: any) => (
                      <tr key={`${log.transactionHash}-${log.logIndex}`}>
                        <td>
                          <Address address={log.args.requester} />
                        </td>
                        <td>{new Date(tsByHash[log.blockHash as string] || 0).toLocaleString()}</td>
                        <td>
                          <div className="tooltip" data-tip="Approve">
                            <button
                              className="btn btn-sm text-lg btn-outline"
                              onClick={() => handleApproveRequest(log.args.requester)}
                            >
                              ✓
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            );
          })()}
      </div>
    </div>
  );
};

interface FilesTableProps {
  data: any[];
  contractAddress?: `0x${string}`;
  publicClient: any;
  abi?: Abi;
  txTimeByHash?: Record<string, number>;
  showOwnOnly: boolean;
  setShowOwnOnly: (showOwnOnly: boolean) => void;
}

const FilesTable: React.FC<FilesTableProps> = ({
  data,
  contractAddress,
  publicClient,
  abi,
  txTimeByHash,
  showOwnOnly,
  setShowOwnOnly,
}) => {
  const { openPopUp } = usePopUp();
  const { address: connected } = useAccount();

  const handleCidClick = (fileId: bigint, cid: string) => {
    openPopUp(
      <FileDetails fileId={fileId} cid={cid} contractAddress={contractAddress} publicClient={publicClient} abi={abi} />,
    );
  };

  return (
    <div className="overflow-x-auto relative">
      <div className="flex gap-2 absolute top-0 right-0 z-10 p-3">
        <input
          id="ownOnly"
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={showOwnOnly}
          onChange={e => setShowOwnOnly(e.target.checked)}
        />
        <label htmlFor="ownOnly" className="text-sm">
          Mine only
        </label>
      </div>
      <table className="table table-zebra w-full">
        <thead>
          <tr>
            <th>ID</th>
            <th>Owner</th>
            <th>CID</th>
            <th>Transaction</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {data.map(evt => (
            <tr key={`${evt.transactionHash}-${evt.logIndex}`}>
              <td>{evt.args.fileId?.toString()}</td>
              <td className="flex items-center gap-1">
                {connected && evt.args.owner?.toLowerCase() === connected.toLowerCase() ? (
                  <div className="flex items-center gap-2">
                    <Link href={`/blockexplorer/address/${evt.args.owner}`} className="flex items-center gap-2">
                      <BlockieAvatar address={evt.args.owner as `0x${string}`} size={20} />
                      <span className="text-md hover:underline">you</span>
                    </Link>
                    <button
                      title="Copy address"
                      onClick={() => navigator.clipboard.writeText(evt.args.owner as string)}
                    >
                      <DocumentDuplicateIcon className="w-4 h-4 cursor-pointer" />
                    </button>
                  </div>
                ) : (
                  <Address address={evt.args.owner} />
                )}
              </td>
              <td>
                <button
                  onClick={() => handleCidClick(evt.args.fileId, evt.args.cid)}
                  className="link link-base-content"
                >
                  {evt.args.cid.length > 20 ? `${evt.args.cid.slice(0, 10)}…${evt.args.cid.slice(-8)}` : evt.args.cid}
                </button>
              </td>
              <td>
                <Link href={`/blockexplorer/transaction/${evt.transactionHash}`} className="link link-base-content">
                  {`${evt.transactionHash.slice(0, 6)}…${evt.transactionHash.slice(-4)}`}
                </Link>
              </td>
              <td>
                {txTimeByHash && txTimeByHash[evt.transactionHash]
                  ? new Date(txTimeByHash[evt.transactionHash]).toLocaleString()
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const FilesPage = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txTimeByHash, setTxTimeByHash] = useState<Record<string, number>>({});
  const [showOwnOnly, setShowOwnOnly] = useState<boolean>(false);
  const { address: connected } = useAccount();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "FileRegistry" });

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const callUploadBackend = async (file: File): Promise<PinataUploadResult> => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const json = await res.json();
      if (res.ok) {
        console.log("Uploaded to IPFS:", json);
        return json as PinataUploadResult;
      } else {
        console.error("Upload failed", json);
        throw new Error("Upload failed");
      }
    } catch (err) {
      console.error("Upload error", err);
      throw new Error("Upload error");
    }
  };

  const callDeleteBackend = async (id: string): Promise<void> => {
    const fd = new FormData();
    fd.append("id", id);
    try {
      const res = await fetch("/api/files", { method: "DELETE", body: fd });
      if (res.ok) {
        console.log("Deleted from IPFS:", id);
      }
    } catch (err) {
      console.error("Delete failed", err);
      throw new Error("Delete failed");
    }
  };

  const handleFileSelected = async (file: File) => {
    encryptFileWithAes(file)
      .then(async (encryptedFile: AesEncryptedFile) => {
        console.log("File successfully encrypted, uploading to IPFS...");
        callUploadBackend(encryptedFile.file)
          .then(async (result: PinataUploadResult) => {
            console.log("File successfully uploaded to IPFS, populating data to contract...");
            writeContractAsync({
              functionName: "uploadFile",
              args: [result.cid, file.type, encryptedFile.key],
            })
              .then(async () => {
                console.log("File data successfully populated to contract");
              })
              .catch(async err => {
                console.error("Failed to populate file data to contract: ", err);
                console.log("Deleting file from IPFS...");
                callDeleteBackend(result.id)
                  .then(async () => {
                    console.log("File successfully deleted from IPFS");
                  })
                  .catch(err => {
                    console.error("Failed to delete file from IPFS: ", err);
                  });
              });
          })
          .catch(err => {
            console.error("Failed to upload file to IPFS: ", err);
          });
      })
      .catch(err => {
        console.error("Encryption error: ", err);
      });
  };

  const onFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFileSelected(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const selected = useSelectedNetwork();
  const publicClient = usePublicClient({ chainId: selected.id });

  const { data: deployed } = useDeployedContractInfo({
    contractName: "FileRegistry",
    chainId: selected.id as AllowedChainIds,
  });

  const { data: blockNumber } = useBlockNumber({
    chainId: selected.id,
    watch: true,
  });

  const eventFragment = useMemo(() => {
    if (!deployed?.abi) return undefined;
    return (deployed.abi as Abi).find(p => p.type === "event" && p.name === "FileUploaded") as AbiEvent | undefined;
  }, [deployed?.abi]);

  useEffect(() => {
    if (!publicClient || !deployed?.address || !eventFragment) return;
    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        const logs = await publicClient.getLogs({
          address: deployed.address,
          event: eventFragment,
          fromBlock: BigInt((deployed as any).deployedOnBlock ?? 0),
          toBlock: blockNumber,
        });
        if (!cancelled) {
          setEvents(logs);
          setError(null);
          // fetch block timestamps for logs
          const uniqueBlockHashes = Array.from(
            new Set((logs as any[]).map(l => l.blockHash).filter((h: string | undefined) => Boolean(h))),
          );
          const blocks = await Promise.all(
            uniqueBlockHashes.map((h: string) => publicClient.getBlock({ blockHash: h as `0x${string}` })),
          );
          const blockTsByHash = new Map<string, number>();
          uniqueBlockHashes.forEach((h: string, idx: number) => {
            const tsMs = Number(blocks[idx].timestamp) * 1000;
            blockTsByHash.set(h, tsMs);
          });
          const nextTxTimeByHash: Record<string, number> = {};
          (logs as any[]).forEach(l => {
            const ts = blockTsByHash.get(l.blockHash as string);
            if (ts && l.transactionHash) nextTxTimeByHash[l.transactionHash as string] = ts;
          });
          setTxTimeByHash(nextTxTimeByHash);
        }
      } catch {
        if (!cancelled) setError("Failed to load events");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicClient, deployed?.address, eventFragment, blockNumber, selected.id]);

  return (
    <PopUpProvider>
      <PopUp />
      <div className="p-6 w-full flex justify-center">
        <div className="p-3 border-base-200 bg-base-100 flex gap-3 flex-col shadow-md shadow-secondary border-2 rounded w-full max-w-4xl">
          <div className="text-3xl font-bold text-center">Uploaded Files</div>

          {isLoading && <div className="text-center">Loading events…</div>}
          {error && <div className="text-center text-red-500">{error}</div>}

          {!isLoading &&
            !error &&
            (events?.length ? (
              <FilesTable
                data={
                  showOwnOnly && connected
                    ? events.filter(ev => ev.args.owner?.toLowerCase() === connected.toLowerCase())
                    : events
                }
                contractAddress={deployed?.address}
                publicClient={publicClient}
                abi={deployed?.abi as Abi}
                txTimeByHash={txTimeByHash}
                showOwnOnly={showOwnOnly}
                setShowOwnOnly={setShowOwnOnly}
              />
            ) : (
              <div className="text-center text-sm text-base-content/60">No files uploaded yet.</div>
            ))}

          <div className="text-center">
            <input ref={fileInputRef} type="file" className="hidden" onChange={onFileInputChange} />
            <button className="btn btn-outline gap-2" aria-label="Upload file" onClick={handleUploadClick}>
              <ArrowUpTrayIcon className="w-5 h-5" />
              <span>Upload File</span>
            </button>
          </div>
        </div>
      </div>
    </PopUpProvider>
  );
};

export default FilesPage;
