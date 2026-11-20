import AVFoundation
import Capacitor
import PhotosUI
import UIKit
import UniformTypeIdentifiers

final class ClubBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PhotoSelectionPlugin())
    }
}

@objc(PhotoSelectionPlugin)
final class PhotoSelectionPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate,
    UIDocumentPickerDelegate, UIImagePickerControllerDelegate, UINavigationControllerDelegate,
    UIAdaptivePresentationControllerDelegate {
    let identifier = "PhotoSelectionPlugin"
    let jsName = "PhotoSelection"
    let pluginMethods = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "release", returnType: CAPPluginReturnPromise)
    ]

    private struct Selection {
        let call: CAPPluginCall
        let limit: Int
        let maxBytes: Int
    }

    private enum ImportError: Error {
        case unreadable
        case tooLarge(String)
    }

    private var selection: Selection?
    private weak var picker: UIViewController?
    private var cleanedOldTransfers = false
    private let transfers = FileManager.default.temporaryDirectory
        .appendingPathComponent("ClubPhotoSelection", isDirectory: true)

    @objc func pick(_ call: CAPPluginCall) {
        guard let limit = call.getInt("limit"), (1...6).contains(limit),
              let maxBytes = call.getInt("maxBytes"), (1...10_485_760).contains(maxBytes) else {
            call.reject("There are no open photo slots.")
            return
        }
        DispatchQueue.main.async {
            guard self.selection == nil, let presenter = self.bridge?.viewController,
                  presenter.presentedViewController == nil else {
                call.reject("A photo picker is already open.")
                return
            }
            if !self.cleanedOldTransfers {
                try? FileManager.default.removeItem(at: self.transfers)
                self.cleanedOldTransfers = true
            }
            self.selection = Selection(call: call, limit: limit, maxBytes: maxBytes)
            self.showSources(from: presenter, limit: limit)
        }
    }

    @objc func release(_ call: CAPPluginCall) {
        guard let id = call.getString("transfer").flatMap({ UUID(uuidString: $0) }) else {
            call.reject("Invalid photo transfer.")
            return
        }
        try? FileManager.default.removeItem(at: transfers.appendingPathComponent(id.uuidString))
        call.resolve()
    }

    private func showSources(from presenter: UIViewController, limit: Int) {
        let style: UIAlertController.Style = presenter.traitCollection.userInterfaceIdiom == .pad ? .alert : .actionSheet
        let menu = UIAlertController(title: nil, message: nil, preferredStyle: style)
        menu.addAction(UIAlertAction(title: "Photo Library", style: .default) { [weak self, weak menu] _ in
            self?.afterClosing(menu) {
                var config = PHPickerConfiguration()
                config.filter = .images
                config.selectionLimit = limit
                config.selection = .ordered
                config.preferredAssetRepresentationMode = .compatible
                let library = PHPickerViewController(configuration: config)
                library.delegate = self
                self?.present(library, from: presenter)
            }
        })
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            menu.addAction(UIAlertAction(title: "Take Photo", style: .default) { [weak self, weak menu] _ in
                self?.afterClosing(menu) {
                    self?.openCamera(from: presenter)
                }
            })
        }
        menu.addAction(UIAlertAction(title: "Choose Files", style: .default) { [weak self, weak menu] _ in
            self?.afterClosing(menu) {
                let files = UIDocumentPickerViewController(forOpeningContentTypes: [.image], asCopy: true)
                files.allowsMultipleSelection = limit > 1
                files.delegate = self
                self?.present(files, from: presenter)
            }
        })
        menu.addAction(UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in
            self?.finish()
        })
        present(menu, from: presenter)
    }

    private func afterClosing(_ menu: UIAlertController?, action: @escaping () -> Void) {
        guard let menu, menu.presentingViewController != nil else {
            action()
            return
        }
        if menu.isBeingDismissed, let transition = menu.transitionCoordinator,
           transition.animate(alongsideTransition: nil, completion: { _ in action() }) {
            return
        }
        menu.dismiss(animated: true, completion: action)
    }

    private func present(_ controller: UIViewController, from presenter: UIViewController) {
        picker = controller
        controller.presentationController?.delegate = self
        presenter.present(controller, animated: true)
    }

    private func openCamera(from presenter: UIViewController) {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                guard granted else {
                    self.fail("Allow camera access in Settings to take a photo.")
                    return
                }
                let camera = UIImagePickerController()
                camera.sourceType = .camera
                camera.cameraCaptureMode = .photo
                camera.delegate = self
                camera.modalPresentationStyle = .fullScreen
                self.present(camera, from: presenter)
            }
        }
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        if picker === presentationController.presentedViewController { finish() }
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        close(picker)
        guard !results.isEmpty else { finish(); return }
        importPhotos(count: results.count) { index, directory, maxBytes in
            let provider = results[index].itemProvider
            guard let type = provider.registeredTypeIdentifiers.compactMap({ UTType($0) })
                .first(where: { $0.conforms(to: .image) }) else { throw ImportError.unreadable }
            return try await withCheckedThrowingContinuation { continuation in
                provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
                    do {
                        guard let url else { throw ImportError.unreadable }
                        let photo = try Self.copyPhoto(
                            url, name: provider.suggestedName, fallback: type, to: directory, maxBytes: maxBytes
                        )
                        continuation.resume(returning: photo)
                    } catch {
                        continuation.resume(throwing: error)
                    }
                }
            }
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        close(controller)
        guard !urls.isEmpty else { finish(); return }
        importPhotos(count: urls.count) { index, directory, maxBytes in
            try Self.copyPhoto(urls[index], to: directory, maxBytes: maxBytes)
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        close(controller)
        finish()
    }

    func imagePickerController(_ picker: UIImagePickerController,
                               didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        close(picker)
        guard let image = info[.originalImage] as? UIImage else {
            fail("Could not read the photo. Try again.")
            return
        }
        importPhotos(count: 1) { _, directory, maxBytes in
            guard let data = image.jpegData(compressionQuality: 0.9) else { throw ImportError.unreadable }
            guard data.count <= maxBytes else { throw ImportError.tooLarge("That photograph") }
            let target = directory.appendingPathComponent("photo.jpg")
            try data.write(to: target)
            return ["url": target.absoluteString, "name": "photo.jpg", "type": "image/jpeg"]
        }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        close(picker)
        finish()
    }

    private func close(_ controller: UIViewController) {
        picker = nil
        controller.dismiss(animated: true)
    }

    private func importPhotos(count: Int, load: @escaping (Int, URL, Int) async throws -> JSObject) {
        guard let selection else { return }
        let id = UUID().uuidString
        let directory = transfers.appendingPathComponent(id, isDirectory: true)
        Task { @MainActor in
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                var photos: [JSObject] = []
                for index in 0..<min(count, selection.limit) {
                    photos.append(try await load(index, directory, selection.maxBytes))
                }
                finish(["photos": photos, "transfer": id, "overflow": count > selection.limit])
            } catch let ImportError.tooLarge(name) {
                try? FileManager.default.removeItem(at: directory)
                fail("\(name) is over 10MB. Try a smaller one.")
            } catch {
                try? FileManager.default.removeItem(at: directory)
                fail("Could not read the selected photos. Try again.")
            }
        }
    }

    private static func copyPhoto(_ url: URL, name: String? = nil, fallback: UTType? = nil,
                                  to directory: URL, maxBytes: Int) throws -> JSObject {
        let values = try url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .isRegularFileKey])
        guard values.isRegularFile == true, let size = values.fileSize, size > 0,
              let type = [values.contentType, fallback].compactMap({ $0 })
                .first(where: { $0.conforms(to: .image) }),
              let mime = type.preferredMIMEType, let ext = type.preferredFilenameExtension else {
            throw ImportError.unreadable
        }
        let filename = name.map {
            URL(fileURLWithPath: $0).deletingPathExtension().lastPathComponent + "." + ext
        } ?? url.lastPathComponent
        guard size <= maxBytes else { throw ImportError.tooLarge(filename) }
        let target = directory.appendingPathComponent(UUID().uuidString).appendingPathExtension(ext)
        try FileManager.default.copyItem(at: url, to: target)
        return ["url": target.absoluteString, "name": filename, "type": mime]
    }

    private func finish(_ result: JSObject = ["photos": [] as [JSObject]]) {
        let call = selection?.call
        selection = nil
        call?.resolve(result)
    }

    private func fail(_ message: String) {
        let call = selection?.call
        selection = nil
        call?.reject(message)
    }
}
